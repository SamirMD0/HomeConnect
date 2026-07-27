import {
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  FinancialCorrectionSourceScreen,
} from '@prisma/client';
import { z } from 'zod';

const uuidSchema = z.string().uuid('Invalid ID');
const businessDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

export const correctionsQuerySchema = z
  .object({
    recordType: z.nativeEnum(FinancialCorrectionRecordType).optional(),
    recordId: uuidSchema.optional(),
    customerId: uuidSchema.optional(),
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
  })
  .strict();

export const customerCorrectionsParamsSchema = z.object({
  customerId: uuidSchema,
});

export const correctionReasonSchema = z.string().trim().min(5, 'Correction reason must be at least 5 characters');

export type CorrectionsQueryInput = z.infer<typeof correctionsQuerySchema>;
export type CustomerCorrectionsParamsInput = z.infer<typeof customerCorrectionsParamsSchema>;

export {
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  FinancialCorrectionSourceScreen,
};
