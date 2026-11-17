// Test-only SQLite implementation. Production never imports sql.js.
import initSqlJs from 'sql.js';
import { initializeLocalDb, type LocalDb } from '../local-db';
export async function memoryDb(): Promise<LocalDb> {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  let pending = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = pending.then(work); pending = next.then(() => {}, () => {}); return next;
  };
  const direct: LocalDb = {
    exec: async (sql, params) => { sqlite.run(sql, params); },
    query: async <T extends object>(sql: string, params = []) => {
      const statement = sqlite.prepare(sql);
      try {
        statement.bind(params); const result: T[] = [];
        while (statement.step()) result.push(statement.getAsObject() as T);
        return result;
      } finally { statement.free(); }
    },
    transaction: async () => { throw new Error('Nested transaction'); },
  };
  const db: LocalDb = {
    exec: (sql, params) => serial(() => direct.exec(sql, params)),
    query: <T extends object>(sql: string, params = []) => serial(() => direct.query<T>(sql, params)),
    transaction: work => serial(async () => {
      sqlite.run('BEGIN');
      try { const value = await work(direct); sqlite.run('COMMIT'); return value; }
      catch (error) { sqlite.run('ROLLBACK'); throw error; }
    }),
  };
  await initializeLocalDb(db);
  return db;
}
