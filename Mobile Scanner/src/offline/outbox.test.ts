import { describe, expect, it, vi } from 'vitest';
import { memoryDb } from './testing/memory-db';
import { applyRecords, wipeLocalDb } from './record-store';
import {
  actionMessage,
  cleanOutbox,
  dismissAction,
  listOutbox,
  REVOKED_MESSAGE,
  saveAction,
  type PhotoFiles,
  type SaveAction,
} from './outbox';
const input: SaveAction = {
  owner: 'device:user',
  submissionKey: 'draft',
  type: 'sales_order.create',
  branchId: 'a',
  payload: { items: [], idempotencyKey: 'draft' },
  summary: 'Order · Rami',
};
const files: PhotoFiles = {
  copy: vi.fn(async () => ({ path: 'documents/bill.jpg', size: 123 })),
  read: vi.fn(async () => new Blob(['photo'])),
  remove: vi.fn(async () => {}),
};
describe('durable phone outbox', () => {
  it('lets the user dismiss failed photos while retaining their files until confirmation or unpairing', async () => {
    const db = await memoryDb();
    await saveAction(
      db,
      { ...input, type: 'supplier_bill.upload', photo: { uri: 'cache', mime: 'image/jpeg' } },
      { uuid: () => 'failed-photo', files }
    );
    await db.exec("UPDATE outbox SET local_status='failed'");
    await dismissAction(db, 'failed-photo');
    expect(await listOutbox(db)).toEqual([]);
    expect(await db.query('SELECT photo_path FROM outbox')).toEqual([
      { photo_path: 'documents/bill.jpg' },
    ]);
  });
  it('creates its ID only on Save, survives a crash and deduplicates the form acknowledgement gap', async () => {
    const db = await memoryDb(),
      uuid = vi.fn(() => 'one-id');
    expect(uuid).not.toHaveBeenCalled();
    const saved = await saveAction(db, input, { uuid });
    // The form never received its acknowledgement. Opening another repository uses the same SQLite row.
    const recovered = await saveAction(db, input, { uuid });
    expect(saved.id).toBe('one-id');
    expect(recovered).toEqual(saved);
    expect(uuid).toHaveBeenCalledTimes(1);
    expect(JSON.parse(saved.payload).idempotencyKey).toBe('one-id');
    expect((await db.query<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version).toBe(
      2
    );
  });
  it('copies the photo first and retains it until applied or refused, including failed actions', async () => {
    const db = await memoryDb();
    await saveAction(
      db,
      { ...input, type: 'supplier_bill.upload', photo: { uri: 'cache/photo', mime: 'image/jpeg' } },
      { uuid: () => 'photo-id', files }
    );
    expect(files.copy).toHaveBeenCalledWith('cache/photo', 'photo-id', 'image/jpeg');
    for (const status of ['queued', 'awaiting_photo', 'pending', 'claimed', 'failed']) {
      await db.exec('UPDATE outbox SET local_status=?', [status]);
      await cleanOutbox(db, files);
      expect((await listOutbox(db))[0]?.photo_path).toBe('documents/bill.jpg');
    }
    await db.exec("UPDATE outbox SET local_status='refused'");
    await cleanOutbox(db, files);
    expect(files.remove).toHaveBeenCalledWith('documents/bill.jpg');
    expect((await listOutbox(db))[0]?.photo_path).toBeNull();
  });
  it('never changes local stock or balances and revocation retains only visible redacted summaries', async () => {
    const db = await memoryDb();
    await applyRecords(db, 'records', [
      { entity: 'product', id: 'p', branchId: null, rev: '1', op: 'upsert', data: { stock: 7 } },
      {
        entity: 'customer',
        id: 'c',
        branchId: 'a',
        rev: '2',
        op: 'upsert',
        data: { financial: { balance: '120.00' } },
      },
    ]);
    const before = await db.query('SELECT * FROM records');
    await saveAction(db, input, { uuid: () => 'saved' });
    expect(await db.query('SELECT * FROM records')).toEqual(before);
    await wipeLocalDb(db);
    const [row] = await listOutbox(db);
    expect(row).toMatchObject({
      summary: 'Order · Rami',
      archived: 1,
      payload: '{}',
      photo_path: null,
      local_status: 'failed',
    });
    expect(actionMessage(row!)).toBe(REVOKED_MESSAGE);
    expect(await db.query('SELECT * FROM records')).toEqual([]);
  });
  it('clears Done only after 24 hours and keeps refused/failed indefinitely', async () => {
    const db = await memoryDb();
    const now = new Date('2026-11-17T10:00:00Z');
    for (const status of ['applied', 'refused', 'failed']) {
      await saveAction(
        db,
        { ...input, submissionKey: status },
        { uuid: () => status, now: () => now }
      );
      await db.exec('UPDATE outbox SET local_status=? WHERE id=?', [status, status]);
    }
    await cleanOutbox(db, files, new Date(now.getTime() + 86399999));
    expect(await listOutbox(db)).toHaveLength(3);
    await cleanOutbox(db, files, new Date(now.getTime() + 86400000));
    expect((await listOutbox(db)).map((row) => row.id).sort()).toEqual(['failed', 'refused']);
    const uuid = vi.fn(() => 'must-not-generate');
    const recovered = await saveAction(db, { ...input, submissionKey: 'applied' }, { uuid });
    expect(recovered.id).toBe('applied');
    expect(recovered.local_status).toBe('applied');
    expect(uuid).not.toHaveBeenCalled();
    await dismissAction(db, 'refused');
    expect((await saveAction(db, { ...input, submissionKey: 'refused' }, { uuid })).id).toBe(
      'refused'
    );
    expect(uuid).not.toHaveBeenCalled();
  });
});
