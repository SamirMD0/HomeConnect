import { z } from 'zod';
import { databaseUuidSchema } from '../../../validators/database-uuid';

export const MAX_PRINT_SNAPSHOT_BYTES = 8 * 1024;
const uuid = databaseUuidSchema('Invalid ID');
const nullableUuid = z.preprocess((value) => value === '' ? null : value, uuid.nullable().optional());
const money = z.string().trim().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, 'Public price must be a non-negative decimal with up to 2 decimal places');
const snapshot = z.record(z.string(), z.unknown()).refine(
  (value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_PRINT_SNAPSHOT_BYTES,
  'Print snapshot must be 8 KB or smaller'
);

export const recordPrintSnapshotSchema = z.object({
  productId: uuid,
  templateId: uuid,
  snapshot,
  validUntil: z.preprocess((value) => value === '' ? null : value,
    z.string().date().transform((value) => new Date(`${value}T00:00:00.000Z`)).nullable().optional()),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency code must be a three-letter ISO code'),
  publicPrice: money,
  staffLabelCode: z.preprocess((value) => value === '' ? null : value, z.string().trim().max(256).nullable().optional()),
  barcodeValue: z.string().trim().min(1).max(128),
  copiesPrinted: z.number().int().min(1).max(1000).default(1),
  hiddenPricingPresetId: nullableUuid,
  encodingPresetId: nullableUuid,
  accountPassword: z.string().min(1, 'Account password is required'),
}).strict();

export const printSnapshotProductParamsSchema = z.object({ productId: uuid });
export const printSnapshotListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();

export type RecordPrintSnapshotInput = z.infer<typeof recordPrintSnapshotSchema>;
