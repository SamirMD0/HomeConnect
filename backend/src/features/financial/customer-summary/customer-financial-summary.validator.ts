import { z } from 'zod';

const uuidSchema = z.string().uuid('Invalid ID');

const booleanQuerySchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true');

export const customerFinancialSummaryParamsSchema = z.object({
  customerId: uuidSchema,
});

export const customerFinancialSummaryQuerySchema = z.object({
  includeCancelled: booleanQuerySchema.default(false),
  includePayments: booleanQuerySchema.default(true),
  paymentLimit: z.coerce.number().int().positive().max(100).default(20),
  debtLimit: z.coerce.number().int().positive().max(100).default(50),
  planLimit: z.coerce.number().int().positive().max(100).default(50),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export type CustomerFinancialSummaryParamsInput = z.infer<
  typeof customerFinancialSummaryParamsSchema
>;
export type CustomerFinancialSummaryQueryInput = z.infer<
  typeof customerFinancialSummaryQuerySchema
>;
