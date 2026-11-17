import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { LocalDb } from './local-db';
const state = vi.hoisted(() => ({
  db: null as LocalDb | null,
  bytes: new Uint8Array([1, 2, 3]),
  remove: vi.fn(),
}));
vi.mock('expo-file-system', () => ({
  File: class {
    async bytes() {
      return state.bytes;
    }
  },
}));
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file://cache/',
  deleteAsync: state.remove,
}));
vi.mock('./expo-db', () => ({ openLocalDb: async () => state.db }));
import { memoryDb } from './testing/memory-db';
import { saveAction, photoFiles, cleanOutbox } from './outbox';
const input = {
  owner: 'device:user',
  submissionKey: 'bill',
  branchId: 'branch',
  type: 'supplier_bill.upload' as const,
  payload: { supplierId: 'supplier' },
  summary: 'Bill · Supplier',
  photo: { uri: 'file://cache/ImageManipulator/photo.jpg', mime: 'image/jpeg' },
};
beforeEach(async () => {
  state.db = await memoryDb();
  state.bytes = new Uint8Array([1, 2, 3]);
  state.remove.mockClear();
});
describe('encrypted outbox photo persistence', () => {
  it('stores bytes and the queued action in one transaction, then removes only the scratch source', async () => {
    const db = state.db!;
    const saved = await saveAction(db, input, { uuid: () => 'bill' });
    expect(saved.photo_path).toBe('cipher-photo:bill');
    expect(new Uint8Array(await (await photoFiles.read(saved.photo_path!)).arrayBuffer())).toEqual(
      state.bytes
    );
    expect(state.remove).toHaveBeenCalledWith(input.photo.uri, { idempotent: true });
    await db.exec("UPDATE outbox SET local_status='failed'");
    await cleanOutbox(db);
    expect(await db.query('SELECT id FROM cloud_photos')).toEqual([{ id: 'bill' }]);
    await db.exec("UPDATE outbox SET local_status='applied'");
    await cleanOutbox(db);
    expect(await db.query('SELECT * FROM cloud_photos')).toEqual([]);
  });
  it('rolls the photo back if saving the action fails and leaves the source available for retry', async () => {
    const payload: Record<string, unknown> = {};
    payload.self = payload;
    await expect(
      saveAction(state.db!, { ...input, payload }, { uuid: () => 'bill' })
    ).rejects.toThrow();
    expect(await state.db!.query('SELECT * FROM cloud_photos')).toEqual([]);
    expect(await state.db!.query('SELECT * FROM outbox')).toEqual([]);
    expect(state.remove).not.toHaveBeenCalled();
  });
  it('rejects oversized photos before queuing an incomplete action', async () => {
    state.bytes = new Uint8Array(2 * 1024 * 1024 + 1);
    await expect(saveAction(state.db!, input, { uuid: () => 'bill' })).rejects.toThrow('2 MB');
    expect(await state.db!.query('SELECT * FROM outbox')).toEqual([]);
  });
});
