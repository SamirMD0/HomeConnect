import {
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  FinancialCorrectionSourceScreen,
} from '@prisma/client';
import { z } from 'zod';
import { userTextSchema } from '../../../validators/user-text';

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

export const correctionReasonSchema = userTextSchema({ field: 'Correction reason', min: 5, max: 1000 });

export type CorrectionsQueryInput = z.infer<typeof correctionsQuerySchema>;
export type CustomerCorrectionsParamsInput = z.infer<typeof customerCorrectionsParamsSchema>;

export {
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  FinancialCorrectionSourceScreen,
};
