import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../lib/prisma', () => ({ prisma: {} }));
import { DbReceiptStorage, DiskReceiptStorage, receiptStorage } from './receipt-storage';

const file = {
  id: '11111111-1111-4111-8111-111111111111',
  filename: '11111111-1111-4111-8111-111111111111.jpg',
};
const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});
describe('receipt storage', () => {
  it('preserves disk bytes, refuses overwrite and removes files idempotently', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-storage-'));
    directories.push(directory);
    const storage = new DiskReceiptStorage(directory);
    const bytes = Buffer.from([255, 216, 0, 1, 254]);
    await storage.put(file, bytes);
    expect(await storage.get(file)).toEqual(bytes);
    await expect(storage.put(file, Buffer.from('replacement'))).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(await storage.get(file)).toEqual(bytes);
    await storage.delete(file);
    await storage.delete(file);
    await expect(storage.get(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('blocks traversal before disk I/O', async () => {
    const storage = new DiskReceiptStorage(os.tmpdir());
    for (const filename of ['../outside.jpg', '/outside.jpg', 'x\\outside.jpg', `${file.id}.exe`]) {
      await expect(storage.get({ ...file, filename })).rejects.toThrow('Invalid receipt filename');
      await expect(storage.put({ ...file, filename }, Buffer.from('p'))).rejects.toThrow();
      await expect(storage.delete({ ...file, filename })).rejects.toThrow();
    }
  });
  it('round trips database bytes and deletes by receipt id', async () => {
    const rows = new Map<string, Buffer>();
    const model = {
      create: vi.fn(async ({ data }) => {
        rows.set(data.receiptId, data.data);
      }),
      findUnique: vi.fn(async ({ where }) =>
        rows.has(where.receiptId) ? { data: rows.get(where.receiptId) } : null
      ),
      deleteMany: vi.fn(async ({ where }) => {
        rows.delete(where.receiptId);
      }),
    };
    const storage = new DbReceiptStorage({ supplierReceiptBlob: model } as never);
    const bytes = Buffer.from([0, 255, 1]);
    await storage.put(file, bytes);
    expect(await storage.get(file)).toEqual(bytes);
    await storage.delete(file);
    await storage.delete(file);
    await expect(storage.get(file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(model.deleteMany).toHaveBeenCalledWith({ where: { receiptId: file.id } });
  });
  it('chooses database storage for hosted mode or the explicit override', () => {
    vi.stubEnv('HOSTED_MODE', 'true');
    expect(receiptStorage()).toBeInstanceOf(DbReceiptStorage);
    vi.stubEnv('HOSTED_MODE', 'false');
    vi.stubEnv('RECEIPT_STORAGE', 'db');
    expect(receiptStorage()).toBeInstanceOf(DbReceiptStorage);
    vi.stubEnv('RECEIPT_STORAGE', 'disk');
    expect(receiptStorage()).toBeInstanceOf(DiskReceiptStorage);
  });
});
