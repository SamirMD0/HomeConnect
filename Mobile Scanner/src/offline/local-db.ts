export type SqlValue = string | number | null | Uint8Array;
export interface LocalDb {
  exec(sql: string, params?: SqlValue[]): Promise<void>;
  query<T extends object>(sql: string, params?: SqlValue[]): Promise<T[]>;
  transaction<T>(work: (tx: LocalDb) => Promise<T>): Promise<T>;
}
const columns =
  'entity TEXT NOT NULL, id TEXT NOT NULL, branch_id TEXT, rev TEXT NOT NULL, data TEXT NOT NULL, name TEXT, code TEXT, phone TEXT, PRIMARY KEY(entity,id)';
export async function initializeLocalDb(db: LocalDb) {
  const version =
    (await db.query<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version ?? 0;
  if (version > 2) throw new Error('Update the app to open this phone database.');
  if (version === 0)
    await db.transaction(async (tx) => {
      await tx.exec(`CREATE TABLE records (${columns}); CREATE TABLE staging_records (${columns});
      CREATE INDEX records_name ON records(entity,name);
      CREATE INDEX records_code ON records(entity,code);
      CREATE INDEX records_phone ON records(entity,phone);
      CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version = 1;`);
    });
  if (version < 2)
    await db.transaction(async (tx) => {
      await tx.exec(`CREATE TABLE outbox (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, submission_key TEXT NOT NULL,
      type TEXT NOT NULL, branch_id TEXT NOT NULL, payload TEXT NOT NULL,
      photo_path TEXT, photo_mime TEXT, photo_size INTEGER,
      local_status TEXT NOT NULL CHECK(local_status IN ('queued','sent','awaiting_photo','pending','claimed','applied','refused','failed')),
      result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, summary TEXT NOT NULL,
      next_attempt_at INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, dismissed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(owner,submission_key));
      CREATE INDEX outbox_owner_status ON outbox(owner,local_status);
      PRAGMA user_version = 2;`);
    });
}
