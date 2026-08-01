import { z } from 'zod';

const booleanQuerySchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true');

const businessDateQuerySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .optional();

export const financialLedgerQuerySchema = z.object({
  type: z
    .enum(['ALL', 'DEBT', 'INSTALLMENT_PLAN', 'PAYMENT', 'OVERDUE'])
    .default('ALL'),
  status: z.enum(['ACTIVE', 'OVERDUE', 'PAID_COMPLETED', 'CANCELLED']).optional(),
  customerId: z.string().uuid('Invalid customer ID').optional(),
  search: z.string().trim().max(100).optional(),
  dueFrom: businessDateQuerySchema,
  dueTo: businessDateQuerySchema,
  paymentFrom: businessDateQuerySchema,
  paymentTo: businessDateQuerySchema,
  includeCancelled: booleanQuerySchema.default(false),
  includeCompleted: booleanQuerySchema.default(false),
  correctedOnly: booleanQuerySchema.default(false),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  sortBy: z.enum(['date', 'createdAt', 'customer', 'amount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type FinancialLedgerQueryInput = z.infer<typeof financialLedgerQuerySchema>;
