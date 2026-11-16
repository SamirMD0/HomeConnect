import { describe, expect, it } from 'vitest';
import { memoryDb } from './testing/memory-db';
import { applyRecords, localDbSize, saveState, stateValue, wipeLocalDb } from './record-store';
describe('phone SQLite schema', () => {
  it('rolls back record and cursor changes together and extracts indexed search fields', async () => {
    const db = await memoryDb();
    const record = { entity: 'product', id: 'p', branchId: null, rev: '9007199254740993', op: 'upsert' as const, data: { name: 'Fan', sku: 'F1', barcode: '123' } };
    await expect(db.transaction(async tx => { await applyRecords(tx, 'records', [record]); await saveState(tx, 'cursor', record.rev); throw Error('interrupted'); })).rejects.toThrow();
    expect(await stateValue(db, 'cursor')).toBeNull();
    expect(await db.query('SELECT * FROM records')).toEqual([]);
    await applyRecords(db, 'records', [record]);
    expect(await db.query('SELECT name,code,rev FROM records')).toEqual([{ name: 'Fan', code: 'F1 123', rev: record.rev }]);
    expect(await localDbSize(db)).toBeGreaterThan(0);
    await wipeLocalDb(db);
    expect(await db.query('SELECT * FROM records')).toEqual([]);
  });
});
