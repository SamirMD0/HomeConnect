import { describe, expect, it, vi } from 'vitest';
import { HcApiError } from '../api/hc-client';
import { createReceiptQueue, QueuedReceipt, receiptIdFor } from './receipt-queue';

// Stub out expo-file-system/legacy BEFORE the queue module is imported, so
// Vitest's SSR transform never has to parse react-native's Flow-based entry
// (expo-file-system transitively imports react-native). The queue module
// uses the stub only through the defaultFs adapter — our tests always
// inject their own FS, so the stub values are never read in practice.
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: null,
  makeDirectoryAsync: async () => undefined,
  copyAsync: async () => undefined,
  deleteAsync: async () => undefined,
  getInfoAsync: async () => ({ exists: false }),
  readAsStringAsync: async () => '',
  writeAsStringAsync: async () => undefined,
  moveAsync: async () => undefined,
}));

/**
 * In-memory FS adapter for the queue tests. Files land in a Map keyed by uri;
 * directories are implicit via createDirectory tracking a Set.
 */
function createMemoryFs() {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  dirs.add('mem://');
  const sizes = new Map<string, number>();
  return {
    documentDirectory: 'mem://',
    files,
    dirs,
    sizes,
    makeDirectoryAsync: vi.fn(async (uri: string) => {
      dirs.add(uri);
    }),
    copyAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
      files.set(to, `(bytes-of ${from})`);
      sizes.set(to, 1234); // Pretend every copied file is 1234 bytes.
    }),
    deleteAsync: vi.fn(async (uri: string) => {
      files.delete(uri);
      sizes.delete(uri);
    }),
    getInfoAsync: vi.fn(async (uri: string) => {
      if (files.has(uri)) return { exists: true, size: sizes.get(uri) ?? files.get(uri)!.length };
      if (dirs.has(uri)) return { exists: true };
      return { exists: false };
    }),
    readAsStringAsync: vi.fn(async (uri: string) => {
      const value = files.get(uri);
      if (value === undefined) throw new Error('ENOENT');
      return value;
    }),
    writeAsStringAsync: vi.fn(async (uri: string, content: string) => {
      files.set(uri, content);
      sizes.set(uri, content.length);
    }),
  };
}

const dummyClient = { baseUrl: 'http://unused', token: 'tok' };

describe('receipt-queue', () => {
  it('starts with an empty pending list on first use', async () => {
    const fs = createMemoryFs();
    const queue = createReceiptQueue(fs, async () => undefined);
    expect(await queue.listPending()).toEqual([]);
  });

  it('enqueue copies the source photo and persists an index entry', async () => {
    const fs = createMemoryFs();
    const queue = createReceiptQueue(fs, async () => undefined);
    const entry = await queue.enqueue({
      supplierPurchaseId: 'p-1',
      supplierPurchaseLabel: 'Ref # 42',
      sourceUri: 'file://cache/abc.jpg',
      mime: 'image/jpeg',
    });
    expect(entry.status).toBe('pending');
    expect(entry.supplierPurchaseId).toBe('p-1');
    expect(entry.localPath.endsWith('.jpg')).toBe(true);
    const pending = await queue.listPending();
    expect(pending.length).toBe(1);
    expect(pending[0]?.id).toBe(entry.id);
  });

  it('flush uploads pending entries and removes successes', async () => {
    const fs = createMemoryFs();
    const uploader = vi.fn().mockResolvedValue(undefined);
    const queue = createReceiptQueue(fs, uploader);
    await queue.enqueue({
      supplierPurchaseId: 'p-1',
      supplierPurchaseLabel: 'A',
      sourceUri: 'file://a',
      mime: 'image/jpeg',
    });
    await queue.enqueue({
      supplierPurchaseId: 'p-2',
      supplierPurchaseLabel: 'B',
      sourceUri: 'file://b',
      mime: 'image/jpeg',
    });

    const result = await queue.flush(dummyClient);

    expect(result).toEqual({ attempted: 2, synced: 2, failed: 0 });
    expect(uploader).toHaveBeenCalledTimes(2);
    expect(await queue.listPending()).toEqual([]);
  });

  it('flush marks failed uploads as failed and keeps them in the queue', async () => {
    const fs = createMemoryFs();
    const uploader = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Network down'));
    const queue = createReceiptQueue(fs, uploader);
    await queue.enqueue({
      supplierPurchaseId: 'p-1',
      supplierPurchaseLabel: 'A',
      sourceUri: 'file://a',
      mime: 'image/jpeg',
    });
    await queue.enqueue({
      supplierPurchaseId: 'p-2',
      supplierPurchaseLabel: 'B',
      sourceUri: 'file://b',
      mime: 'image/jpeg',
    });

    const result = await queue.flush(dummyClient);

    expect(result).toEqual({ attempted: 2, synced: 1, failed: 1 });
    const pending = await queue.listPending();
    expect(pending.length).toBe(1);
    expect(pending[0]?.status).toBe('failed');
    expect(pending[0]?.attempts).toBe(1);
    expect(pending[0]?.lastError).toBe('Network down');
  });

  it('flush retries failed entries on the next call', async () => {
    const fs = createMemoryFs();
    const uploader = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const queue = createReceiptQueue(fs, uploader);
    await queue.enqueue({
      supplierPurchaseId: 'p-1',
      supplierPurchaseLabel: 'A',
      sourceUri: 'file://a',
      mime: 'image/jpeg',
    });

    const firstResult = await queue.flush(dummyClient);
    expect(firstResult.failed).toBe(1);

    const secondResult = await queue.flush(dummyClient);
    expect(secondResult.attempted).toBe(1);
    expect(secondResult.synced).toBe(1);
    expect(await queue.listPending()).toEqual([]);
  });

  it('listPending drops corrupt rows but keeps valid ones', async () => {
    const fs = createMemoryFs();
    // Seed the index with one valid entry and one corrupt one.
    const valid: QueuedReceipt = {
      id: 'good-1',
      supplierPurchaseId: 'p-1',
      supplierPurchaseLabel: 'A',
      localPath: 'mem://receipts-pending/good-1.jpg',
      mime: 'image/jpeg',
      bytes: 100,
      capturedAt: '2026-10-03T00:00:00Z',
      updatedAt: '2026-10-03T00:00:00Z',
      attempts: 0,
      lastError: null,
      status: 'pending',
    };
    await fs.writeAsStringAsync(
      'mem://receipts-pending/receipt-queue.json',
      JSON.stringify([valid, { id: 'bad', foo: 1 }])
    );
    const queue = createReceiptQueue(fs, async () => undefined);
    const pending = await queue.listPending();
    expect(pending.length).toBe(1);
    expect(pending[0]?.id).toBe('good-1');
  });
});

describe('receipt queue recovery and concurrency', () => {
  const draft = {
    supplierPurchaseId: 'p-1',
    supplierPurchaseLabel: 'Supplier · Ref 1',
    sourceUri: 'file://a.jpg',
    mime: 'image/jpeg',
  };
  it('migrates old entries and recovers stale uploading entries after two minutes', async () => {
    const fs = createMemoryFs();
    const queue = createReceiptQueue(fs, async () => undefined);
    const entry = await queue.enqueue(draft);
    const legacy = {
      ...entry,
      status: 'uploading',
      capturedAt: new Date(Date.now() - 180_000).toISOString(),
      updatedAt: undefined,
    };
    fs.files.set('mem://receipts-pending/receipt-queue.json', JSON.stringify([legacy]));
    const recovered = await queue.listPending();
    expect(recovered[0]).toMatchObject({
      status: 'failed',
      lastError: expect.stringContaining('interrupted'),
      updatedAt: expect.any(String),
    });
    expect(JSON.parse(fs.files.get('mem://receipts-pending/receipt-queue.json')!)[0].status).toBe(
      'failed'
    );
    expect((await queue.flush(dummyClient)).synced).toBe(1);
  });
  it('shows fresh uploading items and does not start another upload', async () => {
    const fs = createMemoryFs();
    const uploader = vi.fn();
    const queue = createReceiptQueue(fs, uploader);
    const entry = await queue.enqueue(draft);
    fs.files.set(
      'mem://receipts-pending/receipt-queue.json',
      JSON.stringify([{ ...entry, status: 'uploading' }])
    );
    expect((await queue.listPending())[0]?.status).toBe('uploading');
    expect((await queue.flush(dummyClient)).attempted).toBe(0);
    expect(uploader).not.toHaveBeenCalled();
  });
  it.each([
    ['NETWORK', null, 'failed'],
    ['SERVER', 503, 'failed'],
    ['VALIDATION', 400, 'blocked'],
    ['TOO_LARGE', 413, 'blocked'],
    ['NOT_FOUND', 404, 'blocked'],
    ['BRANCH', 403, 'blocked'],
    ['UNAUTHORIZED', 401, 'blocked'],
  ] as const)('classifies %s without losing its real message', async (kind, status, expected) => {
    const fs = createMemoryFs();
    const uploader = vi
      .fn()
      .mockRejectedValue(new HcApiError('Actual server reason', kind, status));
    const queue = createReceiptQueue(fs, uploader);
    await queue.enqueue(draft);
    await queue.flush(dummyClient);
    expect((await queue.listPending())[0]).toMatchObject({
      status: expected,
      lastError: 'Actual server reason',
    });
    await queue.flush(dummyClient);
    expect(uploader).toHaveBeenCalledTimes(expected === 'blocked' ? 1 : 2);
  });
  it('serializes concurrent flushes across separate queue instances', async () => {
    const fs = createMemoryFs();
    let finish!: () => void;
    const uploader = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const first = createReceiptQueue(fs, uploader),
      second = createReceiptQueue(fs, uploader);
    await first.enqueue(draft);
    const a = first.flush(dummyClient),
      b = second.flush(dummyClient);
    await vi.waitFor(() => expect(uploader).toHaveBeenCalledTimes(1));
    finish();
    expect(await a).toEqual({ attempted: 1, synced: 1, failed: 0 });
    await b;
    expect(uploader).toHaveBeenCalledTimes(1);
    expect(await first.listPending()).toEqual([]);
  });
  it('keeps concurrent enqueues and allows retry, change purchase, and delete', async () => {
    const fs = createMemoryFs();
    const queue = createReceiptQueue(
      fs,
      vi.fn().mockRejectedValue(new HcApiError('Wrong purchase', 'NOT_FOUND', 404))
    );
    const [a, b] = await Promise.all([queue.enqueue(draft), queue.enqueue(draft)]);
    expect(await queue.listPending()).toHaveLength(2);
    await queue.flush(dummyClient);
    await queue.changePurchase(a.id, null, 'Supplier · No purchase yet');
    expect((await queue.listPending()).find((row) => row.id === a.id)).toMatchObject({
      supplierPurchaseId: null,
      status: 'pending',
      lastError: null,
    });
    await queue.retry(b.id);
    expect((await queue.listPending()).find((row) => row.id === b.id)?.status).toBe('pending');
    await queue.remove(b.id);
    expect(fs.files.has(b.localPath)).toBe(false);
    expect(await queue.listPending()).toHaveLength(1);
  });
  it('does not reupload after a successful upload when local photo deletion fails', async () => {
    const fs = createMemoryFs();
    const uploader = vi.fn().mockResolvedValue(undefined);
    const queue = createReceiptQueue(fs, uploader);
    await queue.enqueue(draft);
    fs.deleteAsync.mockRejectedValueOnce(new Error('cleanup failed'));
    await queue.flush(dummyClient);
    await queue.flush(dummyClient);
    expect(uploader).toHaveBeenCalledTimes(1);
    expect(await queue.listPending()).toEqual([]);
  });

  it('sends later pages with the first page bill, and waits while the first fails', async () => {
    const fs = createMemoryFs();
    const uploader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ id: 'x' });
    const queue = createReceiptQueue(fs, uploader);
    const lead = await queue.enqueue({ supplierPurchaseId: null, supplierId: 's', supplierPurchaseLabel: 'A', sourceUri: 'file://1', mime: 'image/jpeg' });
    await queue.enqueue({ supplierPurchaseId: null, supplierId: 's', groupLeadId: lead.id, supplierPurchaseLabel: 'A', sourceUri: 'file://2', mime: 'image/jpeg' });

    // First page fails: the second page must not go up alone.
    expect(await queue.flush(dummyClient)).toEqual({ attempted: 1, synced: 0, failed: 1 });
    expect(uploader).toHaveBeenCalledTimes(1);

    expect(await queue.flush(dummyClient)).toEqual({ attempted: 2, synced: 2, failed: 0 });
    expect(uploader.mock.calls[1]![1]).toMatchObject({ receiptId: receiptIdFor(lead.id), billGroupId: undefined });
    expect(uploader.mock.calls[2]![1]).toMatchObject({ billGroupId: receiptIdFor(lead.id) });
  });

  it('links a payment bill after upload and retries the link safely', async () => {
    const fs = createMemoryFs();
    const uploader = vi.fn().mockResolvedValue({ id: 'bill-1', branchId: 'b' });
    const linker = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const queue = createReceiptQueue(fs, uploader, linker);
    const lead = await queue.enqueue({ supplierPurchaseId: null, supplierId: 's', supplierTransactionId: 'pay-1', supplierPurchaseLabel: 'P', sourceUri: 'file://1', mime: 'image/jpeg' });
    await queue.enqueue({ supplierPurchaseId: null, supplierId: 's', supplierTransactionId: 'pay-1', groupLeadId: lead.id, supplierPurchaseLabel: 'P', sourceUri: 'file://2', mime: 'image/jpeg' });

    expect((await queue.flush(dummyClient)).failed).toBe(1);
    expect((await queue.listPending())[0]).toMatchObject({ id: lead.id, status: 'failed' });
    expect(await queue.flush(dummyClient)).toMatchObject({ synced: 2, failed: 0 });
    // The retried upload reuses the same id, so the PC returns the same row.
    expect(uploader.mock.calls[1]![1].receiptId).toBe(uploader.mock.calls[0]![1].receiptId);
    // Only the first page links; later pages inherit it on the PC.
    expect(linker).toHaveBeenCalledTimes(2);
    expect(linker).toHaveBeenLastCalledWith(dummyClient, { id: 'bill-1', branchId: 'b' }, 'pay-1');
  });
});
