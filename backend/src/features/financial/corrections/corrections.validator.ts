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

/** Stored when an admin leaves the reason blank; audit columns are NOT NULL. */
export const NO_REASON_GIVEN = 'No reason given';

export const correctionReasonSchema = userTextSchema({ field: 'Correction reason', min: 1, max: 1000 });

/**
 * Customer financial edits, cancellations and voids are admin-only routes, and
 * admins may skip the reason. A blank reason is recorded as NO_REASON_GIVEN so
 * the audit trail still says one was not given rather than holding an empty row.
 */
export const optionalAdminReasonSchema = (field: string) =>
  userTextSchema({ field, max: 1000 })
    .optional()
    .nullable()
    .transform((value) => (value ? value : NO_REASON_GIVEN));

export type CorrectionsQueryInput = z.infer<typeof correctionsQuerySchema>;
export type CustomerCorrectionsParamsInput = z.infer<typeof customerCorrectionsParamsSchema>;

export {
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  FinancialCorrectionSourceScreen,
};
