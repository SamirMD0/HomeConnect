// Node-only end-to-end adapter. Production never imports this module or sql.js.
import { randomUUID } from 'node:crypto';
import { memoryDb } from './memory-db';
import { SyncEngine } from '../sync-engine';
import { saveAction, listOutbox, ownerKey, type SaveAction, type PhotoFiles } from '../outbox';
import type { CloudPairing } from '../cloud-pairing';

export async function createCloudPhone(pairing: CloudPairing, fetcher: typeof fetch) {
  const db = await memoryDb(),
    photos = new Map<string, Uint8Array>();
  let online = true,
    clock = Date.now(),
    revoked = false;
  const files: PhotoFiles = {
    copy: async (source, id) => {
      const bytes = photos.get(source);
      if (!bytes) throw Error('Missing test photo');
      photos.set(id, bytes);
      return { path: id, size: bytes.length };
    },
    read: async (id) => new Blob([Uint8Array.from(photos.get(id)!)]),
    remove: async (id) => {
      photos.delete(id);
    },
  };
  const transport: typeof fetch = (url, init) => {
    if (!online) return Promise.reject(new TypeError('Phone offline'));
    return fetcher(url, init);
  };
  const engine = new SyncEngine(db, pairing, {
    fetch: transport,
    files,
    now: () => new Date(clock),
    onRevoked: () => {
      revoked = true;
    },
  });
  return {
    db,
    engine,
    files,
    photos,
    get revoked() {
      return revoked;
    },
    offline: () => {
      online = false;
    },
    reconnect: () => {
      online = true;
      clock += 60000;
    },
    queue: (input: Omit<SaveAction, 'owner'>) =>
      saveAction(
        db,
        { ...input, owner: ownerKey(pairing) },
        { uuid: randomUUID, files, now: () => new Date(clock) }
      ),
    rows: () => listOutbox(db),
    sync: () => engine.sync(),
  };
}
