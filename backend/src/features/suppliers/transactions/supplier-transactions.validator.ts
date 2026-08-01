import { SupplierTransactionDirection, SupplierTransactionType } from '@prisma/client';
import { z } from 'zod';
import { compareBusinessDates, parseBusinessDate, todayInBusinessTimezone } from '../../financial/domain/business-date';
import { userTextSchema } from '../../../validators/user-text';
import { resolveSupplierDirection } from '../domain/supplier-domain';
import { isPositiveMoney } from '../../financial/domain/money';

const emptyToNull = (value: unknown) => typeof value === 'string' && value.trim() === '' ? null : value;
const optionalText = (field: string, max: number) => z.preprocess(emptyToNull, userTextSchema({ field, max }).optional().nullable());
const amount = z.string().trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, 'Amount must be a positive decimal string')
  .refine((value) => isPositiveMoney(value), 'Amount must be greater than zero');
/** Date a transaction actually happened on. Cannot be in the future. */
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD').superRefine((value, ctx) => {
  try { parseBusinessDate(value); if (compareBusinessDates(value, todayInBusinessTimezone()) > 0) ctx.addIssue({ code: 'custom', message: 'Future transaction dates are not allowed' }); }
  catch { ctx.addIssue({ code: 'custom', message: 'Invalid transaction date' }); }
});

/**
 * Date used as a ledger filter bound. Future dates are valid here: filtering
 * "up to the end of this month" is a normal request and must not be rejected.
 */
const filterDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD').superRefine((value, ctx) => {
  try { parseBusinessDate(value); }
  catch { ctx.addIssue({ code: 'custom', message: 'Invalid date' }); }
});
const values = {
  type: z.nativeEnum(SupplierTransactionType), direction: z.nativeEnum(SupplierTransactionDirection).optional(),
  amount, transactionDate: date, description: userTextSchema({ field: 'Description', min: 3, max: 500 }),
  reference: optionalText('Reference', 100), notes: optionalText('Notes', 2000),
};
const directionCheck = (v: { type?: SupplierTransactionType; direction?: SupplierTransactionDirection }, ctx: z.RefinementCtx) => {
  if (!v.type) return;
  try { resolveSupplierDirection(v.type, v.direction); } catch (error) { ctx.addIssue({ code: 'custom', path: ['direction'], message: error instanceof Error ? error.message : 'Invalid direction' }); }
};
export const createSupplierTransactionSchema = z.object(values).strict().superRefine(directionCheck);
export const updateSupplierTransactionSchema = z.object({
  type: values.type.optional(), direction: values.direction, amount: values.amount.optional(), transactionDate: values.transactionDate.optional(),
  description: values.description.optional(), reference: values.reference, notes: values.notes,
  reason: userTextSchema({ field: 'Reason', min: 5, max: 1000 }), accountPassword: z.string().min(1),
}).strict();
export const supplierTransactionActionSchema = z.object({ reason: userTextSchema({ field: 'Reason', min: 5, max: 1000 }), accountPassword: z.string().min(1) }).strict();
export const supplierTransactionParamsSchema = z.object({ transactionId: z.string().uuid() });
export const supplierTransactionSupplierParamsSchema = z.object({ supplierId: z.string().uuid() });
export const supplierTransactionListQuerySchema = z.object({
  includeRemoved: z.enum(['true','false']).default('false').transform((v) => v === 'true'),
  page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().positive().max(100).default(25),
});
export const supplierLedgerQuerySchema = z.object({
  supplierId: z.string().uuid().optional(), type: z.nativeEnum(SupplierTransactionType).optional(),
  direction: z.nativeEnum(SupplierTransactionDirection).optional(), dateFrom: filterDate.optional(), dateTo: filterDate.optional(),
  search: z.string().trim().max(200).optional(), includeRemoved: z.enum(['true','false']).default('false').transform((v) => v === 'true'),
  page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().positive().max(100).default(25),
  sortBy: z.enum(['transactionDate','amount','supplier']).default('transactionDate'), sortOrder: z.enum(['asc','desc']).default('desc'),
});

export type CreateSupplierTransactionInput = z.infer<typeof createSupplierTransactionSchema>;
export type UpdateSupplierTransactionInput = z.infer<typeof updateSupplierTransactionSchema>;
export type SupplierTransactionActionInput = z.infer<typeof supplierTransactionActionSchema>;
export type SupplierTransactionListQueryInput = z.infer<typeof supplierTransactionListQuerySchema>;
export type SupplierLedgerQueryInput = z.infer<typeof supplierLedgerQuerySchema>;
