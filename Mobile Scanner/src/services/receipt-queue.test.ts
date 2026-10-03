import { describe, expect, it, vi } from 'vitest';

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
}));

import { createReceiptQueue, QueuedReceipt } from './receipt-queue';

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
    await queue.enqueue({ supplierPurchaseId: 'p-1', supplierPurchaseLabel: 'A', sourceUri: 'file://a', mime: 'image/jpeg' });
    await queue.enqueue({ supplierPurchaseId: 'p-2', supplierPurchaseLabel: 'B', sourceUri: 'file://b', mime: 'image/jpeg' });

    const result = await queue.flush(dummyClient);

    expect(result).toEqual({ attempted: 2, synced: 2, failed: 0 });
    expect(uploader).toHaveBeenCalledTimes(2);
    expect(await queue.listPending()).toEqual([]);
  });

  it('flush marks failed uploads as failed and keeps them in the queue', async () => {
    const fs = createMemoryFs();
    const uploader = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Network down'));
    const queue = createReceiptQueue(fs, uploader);
    await queue.enqueue({ supplierPurchaseId: 'p-1', supplierPurchaseLabel: 'A', sourceUri: 'file://a', mime: 'image/jpeg' });
    await queue.enqueue({ supplierPurchaseId: 'p-2', supplierPurchaseLabel: 'B', sourceUri: 'file://b', mime: 'image/jpeg' });

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
    const uploader = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const queue = createReceiptQueue(fs, uploader);
    await queue.enqueue({ supplierPurchaseId: 'p-1', supplierPurchaseLabel: 'A', sourceUri: 'file://a', mime: 'image/jpeg' });

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
      attempts: 0,
      lastError: null,
      status: 'pending',
    };
    await fs.writeAsStringAsync('mem://receipts-pending/receipt-queue.json', JSON.stringify([valid, { id: 'bad', foo: 1 }]));
    const queue = createReceiptQueue(fs, async () => undefined);
    const pending = await queue.listPending();
    expect(pending.length).toBe(1);
    expect(pending[0]?.id).toBe('good-1');
  });
});
