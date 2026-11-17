import type { SQLiteDatabase, SQLiteBindValue } from 'expo-sqlite';
import { initializeLocalDb, type LocalDb } from './local-db';
function adapter(native: Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getAllAsync'>): LocalDb {
  return {
    exec: async (sql, values) => { if (values) await native.runAsync(sql, values as SQLiteBindValue[]); else await native.execAsync(sql); },
    query: <T extends object>(sql: string, values = []) => native.getAllAsync<T>(sql, values),
    transaction: async () => { throw new Error('Nested local transactions are not supported.'); },
  };
}
let opened: Promise<LocalDb> | null = null;
export function openLocalDb(): Promise<LocalDb> {
  return opened ??= (async () => {
    const { openDatabaseAsync } = await import('expo-sqlite');
    const native = await openDatabaseAsync('home-connect-cloud.db');
    await native.execAsync('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;');
    const db = adapter(native);
    db.transaction = async <T>(work: (tx: LocalDb) => Promise<T>) => {
      let result!: T;
      await native.withExclusiveTransactionAsync(async tx => { result = await work(adapter(tx)); });
      return result;
    };
    await initializeLocalDb(db);
    return db;
  })().catch(error => { opened = null; throw error; });
}
