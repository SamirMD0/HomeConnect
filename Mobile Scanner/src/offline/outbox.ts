import type { LocalDb } from './local-db';
import {copyEncryptedPhoto,readEncryptedPhoto,removeEncryptedPhoto} from './encrypted-photos';

export type ActionType =
  | 'report.request'
  | 'sales_order.create'
  | 'customer_payment.create'
  | 'supplier_payment.create'
  | 'supplier_bill.upload'
  | 'stock_movement.create'
  | 'stock_receiving.create'
  | 'supplier_purchase.create'
  | 'prepaid.create'
  | 'supplier_bill.link'
  | 'supplier_bill.delete'
  | 'supplier_bill.replace';
export type ActionStatus =
  'queued' | 'sent' | 'awaiting_photo' | 'pending' | 'claimed' | 'applied' | 'refused' | 'failed';
export interface OutboxRow {
  id: string;
  owner: string;
  submission_key: string;
  type: ActionType;
  branch_id: string;
  payload: string;
  photo_path: string | null;
  photo_mime: string | null;
  photo_size: number | null;
  local_status: ActionStatus;
  result: string | null;
  created_at: string;
  updated_at: string;
  attempts: number;
  dismissed?:number;
  last_error: string | null;
  summary: string;
  next_attempt_at: number;
  archived: number;
}
export interface PhotoFiles {
  copy(source: string, id: string, mime: string): Promise<{ path: string; size: number }>;
  read(path: string): Promise<Blob>;
  remove(path: string): Promise<void>;
}
export const photoFiles: PhotoFiles = {
  async copy(source, id, mime) {
    return copyEncryptedPhoto(await(await import('./expo-db')).openLocalDb(),source,id);
  },
  async read(path) {
    return readEncryptedPhoto(await(await import('./expo-db')).openLocalDb(),path);
  },
  async remove(path) {
    if(path.startsWith('cipher-photo:'))await removeEncryptedPhoto(await(await import('./expo-db')).openLocalDb(),path);
    else await(await import('expo-file-system/legacy')).deleteAsync(path,{idempotent:true});
  },
};
export const FAILED_MESSAGE =
  'The shop PC could not apply this. Check it on the PC before trying again.';
export const REVOKED_MESSAGE = 'Not sent: this phone was removed by the shop';
export const ownerKey = (pairing: { deviceId: string; userId: string }) =>
  `${pairing.deviceId}:${pairing.userId}`;
export const unfinished = (row: OutboxRow) =>
  !['applied', 'refused', 'failed'].includes(row.local_status);
export function actionMessage(row: OutboxRow) {
  if (row.archived) return row.last_error ?? REVOKED_MESSAGE;
  if (row.local_status === 'applied') return 'Done';
  if (row.local_status === 'failed') return row.last_error ?? FAILED_MESSAGE;
  if (row.local_status === 'refused') {
    try {
      return JSON.parse(row.result ?? '{}').message || 'The shop PC refused this action.';
    } catch {
      return 'The shop PC refused this action.';
    }
  }
  return {
    queued: 'Saved. Waiting for the shop PC',
    sent: 'Sent. Waiting for the shop PC',
    awaiting_photo: 'Waiting to send the photo',
    pending: 'Waiting for the shop PC',
    claimed: 'The shop PC is checking this',
  }[row.local_status];
}
export async function listOutbox(db: LocalDb, owner?: string) {
  return db.query<OutboxRow>(
    `SELECT * FROM outbox WHERE dismissed=0 ${owner ? 'AND (owner=? OR archived=1)' : ''} ORDER BY created_at DESC,id DESC`,
    owner ? [owner] : []
  );
}
export interface SaveAction {
  owner: string;
  submissionKey: string;
  type: ActionType;
  branchId: string;
  payload: Record<string, unknown>;
  summary: string;
  photo?: { uri: string; mime: string };
}
/** No network here. The submission key bridges a crash between SQLite and the form's saved acknowledgement. */
export async function saveAction(
  db: LocalDb,
  input: SaveAction,
  options: { uuid?: () => string; now?: () => Date; files?: PhotoFiles } = {}
) {
  const saved=await db.transaction(async (tx) => {
    const existing = (
      await tx.query<OutboxRow>('SELECT * FROM outbox WHERE owner=? AND submission_key=?', [
        input.owner,
        input.submissionKey,
      ])
    )[0];
    if (existing) return existing;
    const id = options.uuid ? options.uuid() : (await import('expo-crypto')).randomUUID();
    const files = options.files ?? photoFiles;
    if (input.photo && !['image/jpeg', 'image/png', 'image/webp'].includes(input.photo.mime))
      throw new Error('Choose a JPEG, PNG or WebP photo.');
    if (input.type === 'supplier_bill.upload' && !input.photo)
      throw new Error('A bill photo is required.');
    const photo = input.photo ? options.files?await files.copy(input.photo.uri,id,input.photo.mime):await copyEncryptedPhoto(tx,input.photo.uri,id) : null;
    const now = (options.now ?? (() => new Date()))().toISOString();
    const payload = { ...input.payload };
    if (input.type === 'sales_order.create' || input.type === 'customer_payment.create')
      payload.idempotencyKey = id;
    await tx.exec(
      `INSERT INTO outbox(id,owner,submission_key,type,branch_id,payload,photo_path,photo_mime,photo_size,local_status,created_at,updated_at,summary)
      VALUES (?,?,?,?,?,?,?,?,?,'queued',?,?,?)`,
      [
        id,
        input.owner,
        input.submissionKey,
        input.type,
        input.branchId,
        JSON.stringify(payload),
        photo?.path ?? null,
        input.photo?.mime ?? null,
        photo?.size ?? null,
        now,
        now,
        input.summary,
      ]
    );
    return (await tx.query<OutboxRow>('SELECT * FROM outbox WHERE id=?', [id]))[0]!;
  });
  if(input.photo&&!options.files)await(await import('../security/capture-cache')).removeCapturedSource(input.photo.uri).catch(()=>{});
  return saved;
}
export async function cleanOutbox(db: LocalDb, files = photoFiles, now = new Date()) {
  for (const row of await listOutbox(db)) {
    if (['applied', 'refused'].includes(row.local_status) && row.photo_path) {
      try {
        await files.remove(row.photo_path);
        await db.exec('UPDATE outbox SET photo_path=NULL WHERE id=?', [row.id]);
      } catch {
        /* Retry cleanup next cycle. */
      }
    }
    if (
      row.local_status === 'applied' &&
      !row.archived &&
      now.getTime() - Date.parse(row.updated_at) >= 86400000 &&
      (!row.photo_path ||
        !(
          await db.query<{ photo_path: string | null }>(
            'SELECT photo_path FROM outbox WHERE id=?',
            [row.id]
          )
        )[0]?.photo_path)
    )
      await db.exec("UPDATE outbox SET dismissed=1,payload='{}',result=NULL,summary='' WHERE id=?", [row.id]);
  }
}
export async function dismissAction(db: LocalDb, id: string) {
  const row = (await db.query<OutboxRow>('SELECT * FROM outbox WHERE id=?', [id]))[0];
  if (!row || !['refused', 'failed'].includes(row.local_status)) return;
  // Failed work can have committed on the PC. Never offer a retry with a fresh ID.
  if (row.photo_path && (row.archived || row.local_status === 'refused')) {
    await photoFiles.remove(row.photo_path);
    await db.exec('UPDATE outbox SET photo_path=NULL WHERE id=?',[id]);
  }
  // Keep the ID/submission receipt: a form acknowledgement lost before a crash
  // must never generate a second action, even after Done expires or dismissal.
  await db.exec("UPDATE outbox SET dismissed=1,payload='{}',result=NULL,summary='' WHERE id=?",[id]);
}
export async function archiveOutbox(db: LocalDb) {
  const photos = await db.query<{ photo_path: string }>(
    'SELECT photo_path FROM outbox WHERE photo_path IS NOT NULL'
  );
  await db.exec(`DELETE FROM outbox WHERE local_status='applied';
    UPDATE outbox SET archived=1, payload='{}', result=NULL, photo_path=NULL, photo_mime=NULL, photo_size=NULL,
    local_status='failed', last_error='${REVOKED_MESSAGE}' WHERE archived=0;`);
  return photos.map((row) => row.photo_path);
}
