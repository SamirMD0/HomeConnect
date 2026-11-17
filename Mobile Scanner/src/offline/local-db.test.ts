import { describe, expect, it } from 'vitest';
import { memoryDb } from './testing/memory-db';
import { initializeLocalDb } from './local-db';
import {
  applyRecords,
  localDbSize,
  pruneOrders,
  saveState,
  stateValue,
  wipeLocalDb,
} from './record-store';
describe('phone SQLite schema', () => {
  it('migrates version one in place, preserving records and the cursor', async () => {
    const db = await memoryDb();
    await db.exec('DROP TABLE outbox; PRAGMA user_version=1');
    await saveState(db, 'cursor', '9007199254740993');
    await applyRecords(db, 'records', [
      {
        entity: 'customer',
        id: 'c',
        branchId: 'a',
        rev: '1',
        op: 'upsert',
        data: { name: 'Rami' },
      },
    ]);
    await initializeLocalDb(db);
    await initializeLocalDb(db);
    expect(await stateValue(db, 'cursor')).toBe('9007199254740993');
    expect(await db.query('SELECT id FROM records')).toEqual([{ id: 'c' }]);
    expect(await db.query('SELECT * FROM outbox')).toEqual([]);
  });
  it('keeps the ninety-day boundary and prunes only older orders', async () => {
    const db = await memoryDb();
    await applyRecords(db, 'records', [
      {
        entity: 'sales_order',
        id: 'boundary',
        branchId: 'a',
        op: 'upsert',
        rev: '1',
        data: { orderDate: '2026-08-18' },
      },
      {
        entity: 'sales_order',
        id: 'expired',
        branchId: 'a',
        op: 'upsert',
        rev: '2',
        data: { orderDate: '2026-08-17' },
      },
      {
        entity: 'customer',
        id: 'customer',
        branchId: 'a',
        op: 'upsert',
        rev: '3',
        data: { orderDate: '2020-01-01', financial: { outstanding: '9999999999999.99' } },
      },
    ]);
    await pruneOrders(db, new Date('2026-11-16T12:00:00Z'));
    expect(
      (await db.query<{ id: string }>('SELECT id FROM records ORDER BY id')).map((row) => row.id)
    ).toEqual(['boundary', 'customer']);
  });
  it('rolls back record and cursor changes together and extracts indexed search fields', async () => {
    const db = await memoryDb();
    const record = {
      entity: 'product',
      id: 'p',
      branchId: null,
      rev: '9007199254740993',
      op: 'upsert' as const,
      data: { name: 'Fan', sku: 'F1', barcode: '123' },
    };
    await expect(
      db.transaction(async (tx) => {
        await applyRecords(tx, 'records', [record]);
        await saveState(tx, 'cursor', record.rev);
        throw Error('interrupted');
      })
    ).rejects.toThrow();
    expect(await stateValue(db, 'cursor')).toBeNull();
    expect(await db.query('SELECT * FROM records')).toEqual([]);
    await applyRecords(db, 'records', [record]);
    expect(await db.query('SELECT name,code,rev FROM records')).toEqual([
      { name: 'Fan', code: 'F1 123', rev: record.rev },
    ]);
    expect(await localDbSize(db)).toBeGreaterThan(0);
    await wipeLocalDb(db);
    expect(await db.query('SELECT * FROM records')).toEqual([]);
  });
});
