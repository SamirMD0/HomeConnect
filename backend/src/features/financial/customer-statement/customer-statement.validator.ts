import { z } from 'zod';
import { parseBusinessDate } from '../domain/business-date';

const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format').refine((value) => {
  try { parseBusinessDate(value); return true; } catch { return false; }
}, 'Date must be a valid calendar date');

export const customerStatementParamsSchema = z.object({
  customerId: z.string().uuid('Invalid ID'),
});

export const customerStatementQuerySchema = z.object({
  from: businessDateSchema,
  to: businessDateSchema,
}).refine((value) => value.from <= value.to, {
  message: 'From date must not be after to date',
  path: ['from'],
});

export type CustomerStatementQuery = z.infer<typeof customerStatementQuerySchema>;
