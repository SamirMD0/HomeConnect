import { z } from 'zod';
import { parseBusinessDate } from '../../financial/domain/business-date';
import { databaseUuidSchema } from '../../../validators/database-uuid';
import { INVENTORY_QUANTITY_LIMIT } from '../inventory.types';

const uuid = databaseUuidSchema();
const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().max(max).nullable().optional()
);
const businessDate = z.string().superRefine((value, context) => {
  try { parseBusinessDate(value); } catch { context.addIssue({ code: 'custom', message: 'Date must be a valid YYYY-MM-DD date' }); }
});

export const createSupplierReceivingSchema = z.object({
  supplierId: uuid.nullable().optional(),
  referenceNumber: optionalText(200),
  note: optionalText(2000),
  receivedOn: businessDate.optional(),
  items: z.array(z.object({
    productId: uuid,
    quantity: z.number().int('Quantity must be a whole number').min(1).max(INVENTORY_QUANTITY_LIMIT),
  }).strict()).min(1).max(100),
}).strict().superRefine((input, context) => {
  const seen = new Set<string>();
  input.items.forEach((item, index) => {
    if (seen.has(item.productId)) context.addIssue({ code: 'custom', path: ['items', index, 'productId'], message: 'Each product may appear only once' });
    seen.add(item.productId);
  });
});

/**
 * Metadata correction. Deliberately limited to the two fields that carry no
 * stock meaning — a reference number and a note. Quantity, product, date, and
 * supplier are history: correcting those is a void plus a fresh receiving, so
 * the movements stay honest about what was on the shelf and when.
 */
export const updateSupplierReceivingMetadataSchema = z.object({
  referenceNumber: optionalText(200),
  note: optionalText(2000),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
}).strict();

export const voidSupplierReceivingSchema = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
  accountPassword: z.string().min(1, 'Account password is required'),
}).strict();

export const supplierReceivingParamsSchema = z.object({ receivingId: uuid });
export const supplierReceivingListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  supplierId: uuid.optional(),
  referenceNumber: z.string().trim().max(200).optional(),
});
export const supplierReceivingDuplicateSchema = z.object({
  supplierId: uuid,
  referenceNumber: z.string().trim().min(1).max(200),
}).strict();

export type CreateSupplierReceivingInput = z.infer<typeof createSupplierReceivingSchema>;
export type UpdateSupplierReceivingMetadataInput = z.infer<typeof updateSupplierReceivingMetadataSchema>;
export type VoidSupplierReceivingInput = z.infer<typeof voidSupplierReceivingSchema>;
export type SupplierReceivingParamsInput = z.infer<typeof supplierReceivingParamsSchema>;
export type SupplierReceivingListInput = z.infer<typeof supplierReceivingListSchema>;
export type SupplierReceivingDuplicateInput = z.infer<typeof supplierReceivingDuplicateSchema>;
