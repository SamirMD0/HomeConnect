import { describe, it, expect, vi } from 'vitest';
import { memoryDb } from './testing/memory-db';
import { migratePlainDb, type MigrationIo } from './encrypted-migration';
import { saveAction } from './outbox';
import { saveState, stateValue } from './record-store';

async function fixture() {
  const plain = await memoryDb(),
    target = await memoryDb();
  const action = await saveAction(
    plain,
    {
      owner: 'device:user',
      submissionKey: 'draft',
      type: 'supplier_bill.upload',
      branchId: 'branch',
      payload: { amount: '25.00' },
      summary: 'Bill · Supplier',
      photo: { uri: 'file://old.jpg', mime: 'image/jpeg' },
    },
    {
      uuid: () => 'action',
      files: {
        copy: async () => ({ path: 'file://saved.jpg', size: 3 }),
        read: vi.fn(),
        remove: vi.fn(),
      },
    }
  );
  await saveState(plain, 'cursor', '999');
  await saveState(plain, 'owner', 'device:user');
  let exists = true;
  const io: MigrationIo = {
    exists: async () => exists,
    openPlain: async () => ({ ...plain, close: vi.fn() }),
    deletePlain: vi.fn(async () => {
      exists = false;
    }),
    readPhoto: vi.fn(async () => new Uint8Array([1, 2, 3])),
    removePhoto: vi.fn(),
    draftFiles: async () => [{ name: 'draft.0.json', value: '{"customer":"Rami"}' }],
    deleteDraftFiles: vi.fn(),
  };
  return { plain, target, io, action };
}
describe('plain to encrypted database migration', () => {
  it('preserves outbox, encrypted photo and draft contents, requests a full copy, then removes plain files', async () => {
    const { target, io, action } = await fixture();
    await migratePlainDb(target, io);
    expect(await target.query('SELECT * FROM outbox')).toEqual([
      { ...action, photo_path: 'cipher-photo:action' },
    ]);
    expect(
      (await target.query<{ bytes: Uint8Array }>('SELECT bytes FROM cloud_photos'))[0]?.bytes
    ).toEqual(new Uint8Array([1, 2, 3]));
    expect(await target.query('SELECT * FROM cloud_drafts')).toEqual([
      { name: 'draft.0.json', value: '{"customer":"Rami"}' },
    ]);
    expect(await stateValue(target, 'owner')).toBe('device:user');
    expect(await stateValue(target, 'cursor')).toBeNull();
    expect(await stateValue(target, 'fullCopyInProgress')).toBe('true');
    expect(io.deletePlain).toHaveBeenCalledOnce();
    expect(io.removePhoto).toHaveBeenCalledWith('file://saved.jpg');
  });
  it('rolls back a failed copy and safely retries from the untouched plain database', async () => {
    const { target, io } = await fixture();
    vi.mocked(io.readPhoto).mockRejectedValueOnce(Error('interrupted'));
    await expect(migratePlainDb(target, io)).rejects.toThrow('interrupted');
    expect(io.deletePlain).not.toHaveBeenCalled();
    expect(io.removePhoto).not.toHaveBeenCalled();
    expect(await target.query('SELECT * FROM outbox')).toEqual([]);
    expect(await stateValue(target, 'cipherMigrationComplete')).toBeNull();
    await migratePlainDb(target, io);
    expect(await target.query('SELECT id FROM outbox')).toEqual([{ id: 'action' }]);
  });
  it('a crash after commit retries cleanup without overwriting a newer outbox status', async () => {
    const { target, io } = await fixture();
    vi.mocked(io.deletePlain).mockRejectedValueOnce(Error('interrupted cleanup'));
    await expect(migratePlainDb(target, io)).rejects.toThrow('interrupted cleanup');
    expect(await stateValue(target, 'cipherMigrationComplete')).toBe('true');
    await target.exec("UPDATE outbox SET local_status='pending' WHERE id='action'");
    await migratePlainDb(target, io);
    expect(await target.query('SELECT id,local_status FROM outbox')).toEqual([
      { id: 'action', local_status: 'pending' },
    ]);
    expect(io.readPhoto).toHaveBeenCalledOnce();
  });
});
