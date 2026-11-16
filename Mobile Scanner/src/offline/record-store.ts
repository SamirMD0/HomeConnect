import type { LocalDb } from './local-db';
export interface CloudRecord { entity: string; id: string; branchId: string | null; rev: string; op: 'upsert' | 'delete'; data: unknown }
export type RecordTable = 'records' | 'staging_records';
export const stateValue = async (db: LocalDb, key: string) => (await db.query<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key]))[0]?.value ?? null;
export const saveState = (db: LocalDb, key: string, value: string) => db.exec('INSERT INTO sync_state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]);
export async function applyRecords(db: LocalDb, table: RecordTable, records: CloudRecord[]) {
  for (const record of records) {
    if (record.op === 'delete') { await db.exec(`DELETE FROM ${table} WHERE entity=? AND id=?`, [record.entity, record.id]); continue; }
    const data = record.data as Record<string, unknown>;
    const name = typeof data.name === 'string' ? data.name : '';
    const code = [data.sku, data.barcode, data.code, data.orderNumber].filter(value => typeof value === 'string').join(' ');
    const phone = typeof data.phone === 'string' ? data.phone : '';
    await db.exec(`INSERT INTO ${table}(entity,id,branch_id,rev,data,name,code,phone) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(entity,id) DO UPDATE SET branch_id=excluded.branch_id, rev=excluded.rev, data=excluded.data,
      name=excluded.name, code=excluded.code, phone=excluded.phone`,
    [record.entity, record.id, record.branchId, record.rev, JSON.stringify(data), name, code, phone]);
  }
}
export async function wipeLocalDb(db: LocalDb) {
  await db.transaction(async tx => { await tx.exec('DELETE FROM records; DELETE FROM staging_records; DELETE FROM sync_state;'); });
  await db.exec('VACUUM');
}
export async function localDbSize(db: LocalDb) {
  const count = (await db.query<{ page_count: number }>('PRAGMA page_count'))[0]!.page_count;
  const size = (await db.query<{ page_size: number }>('PRAGMA page_size'))[0]!.page_size;
  return count * size;
}
export async function pruneOrders(db: LocalDb, now = new Date()) {
  const cutoff = new Date(now); cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  await db.exec("DELETE FROM records WHERE entity='sales_order' AND substr(json_extract(data,'$.orderDate'),1,10) < ?", [cutoff.toISOString().slice(0, 10)]);
}
