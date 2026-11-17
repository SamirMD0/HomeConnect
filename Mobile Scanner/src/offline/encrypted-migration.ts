import type { LocalDb, SqlValue } from './local-db';
import { initializeLocalDb } from './local-db';
import { saveState, stateValue } from './record-store';
export const CIPHER_DB = 'home-connect-cloud-secure.db',
  PLAIN_DB = 'home-connect-cloud.db';
export interface MigrationIo {
  exists(): Promise<boolean>;
  openPlain(): Promise<LocalDb & { close(): Promise<void> }>;
  deletePlain(): Promise<void>;
  draftFiles(): Promise<{ name: string; value: string }[]>;
  readPhoto(path: string): Promise<Uint8Array>;
  removePhoto(path: string): Promise<void>;
  deleteDraftFiles(): Promise<void>;
}
const MARKER = 'cipherMigrationComplete';
export async function migratePlainDb(db: LocalDb, io: MigrationIo) {
  await initializeLocalDb(db);
  if ((await stateValue(db, MARKER)) !== 'true') {
    const exists = await io.exists(),
      plain = exists ? await io.openPlain() : null;
    let rows: Record<string, SqlValue>[] = [],
      states: { key: string; value: string }[] = [];
    try {
      if (plain) {
        const version =
          (await plain.query<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version ??
          0;
        if (version > 4) throw new Error('Update the phone app before migrating its data.');
        const tables = await plain.query<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table'"
        );
        if (tables.some((row) => row.name === 'outbox'))
          rows = await plain.query('SELECT * FROM outbox');
        if (tables.some((row) => row.name === 'sync_state'))
          states = await plain.query('SELECT key,value FROM sync_state');
      }
    } finally {
      await plain?.close();
    }
    const drafts = await io.draftFiles();
    const columns = (await db.query<{ name: string }>('PRAGMA table_info(outbox)')).map(
      (row) => row.name
    );
    await db.transaction(async (tx) => {
      const oldPhotos: string[] = [];
      for (const row of rows) {
        const copied = { ...row };
        if (
          typeof copied.photo_path === 'string' &&
          copied.photo_path &&
          !copied.photo_path.startsWith('cipher-photo:')
        ) {
          const bytes = await io.readPhoto(copied.photo_path);
          await tx.exec('INSERT OR IGNORE INTO cloud_photos(id,bytes) VALUES (?,?)', [
            String(copied.id),
            bytes,
          ]);
          oldPhotos.push(copied.photo_path);
          copied.photo_path = `cipher-photo:${copied.id}`;
        }
        const names = columns.filter((name) => Object.prototype.hasOwnProperty.call(copied, name));
        await tx.exec(
          `INSERT OR IGNORE INTO outbox(${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`,
          names.map((name) => copied[name]!)
        );
        const check = (
          await tx.query<Record<string, SqlValue>>('SELECT * FROM outbox WHERE id=?', [
            String(row.id),
          ])
        )[0];
        if (!check || check.payload !== row.payload || check.local_status !== row.local_status)
          throw new Error(
            'Could not verify saved actions. The old phone database is still intact.'
          );
      }
      for (const row of states)
        if (!['cursor', 'lastSyncAt', 'snapshotHorizon'].includes(row.key))
          await saveState(tx, row.key, row.value);
      for (const draft of drafts)
        await tx.exec('INSERT OR IGNORE INTO cloud_drafts(name,value) VALUES (?,?)', [
          draft.name,
          draft.value,
        ]);
      await saveState(tx, 'fullCopyInProgress', 'true');
      await saveState(tx, 'cipherLegacyPhotos', JSON.stringify(oldPhotos));
      await saveState(tx, MARKER, 'true');
    });
  }
  const paths = JSON.parse((await stateValue(db, 'cipherLegacyPhotos')) ?? '[]') as string[];
  for (const path of paths) await io.removePhoto(path);
  await io.deleteDraftFiles();
  if (await io.exists()) await io.deletePlain();
  await db.exec("DELETE FROM sync_state WHERE key='cipherLegacyPhotos'");
}
