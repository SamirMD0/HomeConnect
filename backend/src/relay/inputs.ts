import { z } from 'zod';

export const MAX_BLOB_BYTES = 2 * 1024 * 1024;
export const imageMime = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const emptyInput = z.object({});
export const idInput = z.object({ id: z.string().uuid() });
export const cursor = z.string().max(64).regex(/^\d+$/);
const record = z.object({
  entity: z.string().min(1).max(100), id: z.string().uuid(),
  branchId: z.string().uuid().nullable(), op: z.enum(['upsert', 'delete']), data: z.json().optional(),
}).refine(value => value.op === 'delete' || value.data !== undefined, 'Upserts require data');
export const recordsInput = z.object({ pcSeq: cursor, records: z.array(record).max(500) });
export const claimInput = z.object({ limit: z.number().int().min(1).max(50).default(50) });
export const resultInput = z.object({ status: z.enum(['applied', 'refused', 'failed']), result: z.json() });
export const deviceInput = z.object({
  id: z.string().uuid(), userId: z.string().uuid(), userName: z.string().min(1).max(200),
  branchIds: z.array(z.string().uuid()).max(100), name: z.string().min(1).max(200),
  tokenSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export const recordsQuery = z.object({
  after: cursor.default('0').refine(value => BigInt(value) <= 9223372036854775807n),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});
export const actionInput = z.object({
  id: z.string().uuid(), type: z.string().min(1).max(100), branchId: z.string().uuid(),
  payload: z.json().refine(value => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 256 * 1024, 'Payload exceeds 256 KB'),
  createdAt: z.iso.datetime({ offset: true }),
});
export const actionsQuery = z.object({
  ids: z.string().max(3700).transform(value => value.split(','))
    .pipe(z.array(z.string().uuid()).min(1).max(100)),
});
export type RecordsInput = z.infer<typeof recordsInput>;
export type DeviceInput = z.infer<typeof deviceInput>;
export type ActionInput = z.infer<typeof actionInput>;
export type ResultInput = z.infer<typeof resultInput>;
