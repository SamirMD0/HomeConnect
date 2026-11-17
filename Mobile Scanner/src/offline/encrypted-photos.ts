import type { LocalDb } from './local-db';
const photoId = (path: string) => path.slice('cipher-photo:'.length);
export async function copyEncryptedPhoto(db: LocalDb, source: string, id: string) {
  const { File } = await import('expo-file-system');
  const bytes = await new File(source).bytes();
  if (!bytes.byteLength || bytes.byteLength > 2 * 1024 * 1024)
    throw new Error('Choose a photo smaller than 2 MB.');
  await db.exec('INSERT INTO cloud_photos(id,bytes) VALUES (?,?)', [id, bytes]);
  return { path: `cipher-photo:${id}`, size: bytes.byteLength };
}
export async function readEncryptedPhoto(db: LocalDb, path: string) {
  if (!path.startsWith('cipher-photo:'))
    throw new Error('This saved photo needs secure storage migration.');
  const row = (
    await db.query<{ bytes: Uint8Array }>('SELECT bytes FROM cloud_photos WHERE id=?', [
      photoId(path),
    ])
  )[0];
  if (!row) throw new Error('The saved bill photo is missing. Check it on the shop PC.');
  return new Blob([Uint8Array.from(row.bytes)]);
}
export const removeEncryptedPhoto = (db: LocalDb, path: string) =>
  db.exec('DELETE FROM cloud_photos WHERE id=?', [photoId(path)]);
