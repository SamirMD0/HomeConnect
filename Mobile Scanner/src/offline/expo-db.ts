import type { SQLiteDatabase, SQLiteBindValue } from 'expo-sqlite';
import type { LocalDb, SqlValue } from './local-db';
import { CIPHER_DB, PLAIN_DB, migratePlainDb, type MigrationIo } from './encrypted-migration';
import { DB_KEY, PIN_KEY, secretStorage } from '../security/storage';
import { summaryArchive } from '../security/summary-archive';
import type { OutboxRow } from './outbox';
export interface PhoneDb extends LocalDb {
  close(): Promise<void>;
}
export function serialDatabase(
  native: Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getAllAsync' | 'closeAsync'>
): PhoneDb {
  let tail: Promise<unknown> = Promise.resolve(),
    closed = false;
  const direct: LocalDb = {
    exec: async (sql, params) => {
      if (params) await native.runAsync(sql, params as SQLiteBindValue[]);
      else await native.execAsync(sql);
    },
    query: <T extends object>(sql: string, params: SqlValue[] = []) =>
      native.getAllAsync<T>(sql, params),
    transaction: async () => {
      throw new Error('Nested phone transactions are not supported.');
    },
  };
  const serial = <T>(work: () => Promise<T>) => {
    const next = tail.then(() => {
      if (closed) throw new Error('Phone data was cleared.');
      return work();
    });
    tail = next.catch(() => {});
    return next;
  };
  return {
    exec: (sql, params) => serial(() => direct.exec(sql, params)),
    query: <T extends object>(sql: string, params: SqlValue[] = []) =>
      serial(() => direct.query<T>(sql, params)),
    transaction: (work) =>
      serial(async () => {
        await native.execAsync('BEGIN IMMEDIATE');
        try {
          const value = await work(direct);
          await native.execAsync('COMMIT');
          return value;
        } catch (error) {
          await native.execAsync('ROLLBACK');
          throw error;
        }
      }),
    close: async () => {
      closed = true;
      await tail;
      await native.closeAsync();
    },
  };
}
export async function verifyCipher(
  native: Pick<SQLiteDatabase, 'getAllAsync' | 'execAsync'>,
  key: string
) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('The phone encryption key could not be read.');
  const version = await native.getAllAsync<Record<string, string>>('PRAGMA cipher_version');
  if (
    !version[0] ||
    !Object.values(version[0]).some((value) => typeof value === 'string' && value.length > 0)
  )
    throw new Error('This phone app needs a native build with encrypted storage.');
  await native.execAsync(`PRAGMA key = "x'${key}'"`);
  await native.getAllAsync('SELECT count(*) FROM sqlite_master');
}
export async function nativeMigrationIo(): Promise<MigrationIo> {
  const sqlite = await import('expo-sqlite'),
    fs = await import('expo-file-system/legacy');
  const drafts = `${fs.documentDirectory}cloud-sales-drafts-v1/`;
  return {
    exists: async () =>
      (await fs.getInfoAsync(`${sqlite.defaultDatabaseDirectory}/${PLAIN_DB}`)).exists,
    openPlain: async () =>
      serialDatabase(await sqlite.openDatabaseAsync(PLAIN_DB, { useNewConnection: true })),
    deletePlain: () => removeDatabaseFiles(PLAIN_DB),
    draftFiles: async () => {
      if (!(await fs.getInfoAsync(drafts)).exists) return [];
      const names = (await fs.readDirectoryAsync(drafts)).filter((name) =>
        /^[a-f0-9]{64}\.[01]\.json$/.test(name)
      );
      return Promise.all(
        names.map(async (name) => ({ name, value: await fs.readAsStringAsync(drafts + name) }))
      );
    },
    readPhoto: async (path) => {
      const { File } = await import('expo-file-system');
      return new File(path).bytes();
    },
    removePhoto: (path) => fs.deleteAsync(path, { idempotent: true }),
    deleteDraftFiles: () => fs.deleteAsync(drafts, { idempotent: true }),
  };
}
async function removeDatabaseFiles(name: string) {
  const sqlite = await import('expo-sqlite'),
    fs = await import('expo-file-system/legacy');
  const path = `${sqlite.defaultDatabaseDirectory}/${name}`;
  // Native deleteDatabaseAsync throws for an absent file and does not remove sidecars.
  if ((await fs.getInfoAsync(path)).exists) await sqlite.deleteDatabaseAsync(name);
  for (const suffix of ['-wal', '-shm', '-journal'])
    await fs.deleteAsync(path + suffix, { idempotent: true });
}
let opened: Promise<PhoneDb> | null = null,
  wiping = false;
export function openLocalDb(): Promise<PhoneDb> {
  if (wiping) return Promise.reject(new Error('Phone data is being cleared.'));
  return (opened ??= (async () => {
    const sqlite = await import('expo-sqlite'),
      fs = await import('expo-file-system/legacy');
    let key = await secretStorage.get(DB_KEY);
    if (!key) {
      if ((await fs.getInfoAsync(`${sqlite.defaultDatabaseDirectory}/${CIPHER_DB}`)).exists)
        throw new Error('The phone encryption key is missing. Saved data has not been removed.');
      key = Array.from((await import('expo-crypto')).getRandomBytes(32), (byte) =>
        byte.toString(16).padStart(2, '0')
      ).join('');
      await secretStorage.set(DB_KEY, key);
      if ((await secretStorage.get(DB_KEY)) !== key)
        throw new Error('Could not save the phone encryption key.');
    }
    const native = await sqlite.openDatabaseAsync(CIPHER_DB, { useNewConnection: true });
    let db: PhoneDb | undefined;
    try {
      await verifyCipher(native, key);
      await native.execAsync(
        'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;'
      );
      db = serialDatabase(native);
      await migratePlainDb(db, await nativeMigrationIo());
      return db;
    } catch (error) {
      if (db) await db.close().catch(() => {});
      else await native.closeAsync().catch(() => {});
      throw error;
    }
  })().catch((error) => {
    opened = null;
    throw error;
  }));
}
export async function deleteLocalDb() {
  if (wiping) throw new Error('Phone data is already being cleared.');
  const sqlite = await import('expo-sqlite'),
    fs = await import('expo-file-system/legacy');
  const exists =
    Boolean(opened) ||
    (await fs.getInfoAsync(`${sqlite.defaultDatabaseDirectory}/${CIPHER_DB}`)).exists ||
    (await fs.getInfoAsync(`${sqlite.defaultDatabaseDirectory}/${PLAIN_DB}`)).exists;
  const db = exists ? await openLocalDb() : null;
  wiping = true;
  try {
    if (db) await summaryArchive.save(await db.query<OutboxRow>('SELECT * FROM outbox'));
    await db?.close();
    opened = null;
    await removeDatabaseFiles(CIPHER_DB);
    const io = await nativeMigrationIo();
    if (await io.exists()) await io.deletePlain();
    await io.deleteDraftFiles();
    await secretStorage.remove(DB_KEY);
    await secretStorage.remove(PIN_KEY);
    await (await import('../security/capture-cache')).clearCloudCaptureCache();
  } finally {
    wiping = false;
  }
}
