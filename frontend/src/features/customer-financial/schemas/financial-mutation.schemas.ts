import { z } from 'zod';
import { isStrictBusinessDate } from '../utils/business-date';
import { isValidMoneyInput, isMoneyLessThanOrEqual } from '../utils/money-input';
import { businessValidationMessages } from '../../../shared/labels/business-labels';

const moneySchema = z
  .string()
  .trim()
  .min(1, businessValidationMessages.amountRequired)
  .refine(isValidMoneyInput, 'Enter a positive amount with up to two decimals');

const businessDateSchema = z
  .string()
  .trim()
  .min(1, businessValidationMessages.dateRequired)
  .refine(isStrictBusinessDate, 'Use a valid YYYY-MM-DD date');

const optionalTextSchema = z
  .string()
  .transform((value) => value.trim())
  .optional();

export const createDebtSchema = z.object({
  amount: moneySchema,
  description: z.string().trim().min(1, 'Description is required'),
  dueDate: businessDateSchema,
  notes: optionalTextSchema,
});

export const createPrepaidPurchaseSchema = z
  .object({
    itemName: z.string().trim().min(1, 'Item name is required'),
    paymentAmount: moneySchema,
    fullAmount: moneySchema,
    notes: optionalTextSchema,
  })
  .refine((value) => isMoneyLessThanOrEqual(value.paymentAmount, value.fullAmount), {
    path: ['paymentAmount'],
    message: 'Payment cannot exceed the full amount',
  });

export const debtPaymentSchema = (remainingBalance: string) =>
  z.object({
    amount: moneySchema.refine(
      (value) => isMoneyLessThanOrEqual(value, remainingBalance),
      'Payment cannot exceed the remaining balance'
    ),
    paymentDate: businessDateSchema,
    paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHECK', 'OTHER']),
    reference: optionalTextSchema,
    notes: optionalTextSchema,
  });

/** These actions are admin-only, and admins may leave the reason blank. */
const optionalReasonSchema = z.string().trim().max(1000, 'Reason is too long');

export const updateDebtSchema = z.object({
  originalAmount: moneySchema,
  description: z.string().trim().min(1, 'Description is required'),
  dueDate: businessDateSchema,
  notes: optionalTextSchema,
  reason: optionalReasonSchema,
});

export const cancelFinancialRecordSchema = z.object({
  reason: optionalReasonSchema,
});

export const voidPaymentSchema = z.object({
  reason: optionalReasonSchema,
});

export const createInstallmentPlanSchema = z.object({
  totalAmount: moneySchema,
  description: z.string().trim().min(1, 'Description is required'),
  startDate: businessDateSchema,
  installmentCount: z
    .number()
    .int('Installment count must be a whole number')
    .positive('Installment count must be positive')
    .max(120, 'Installment count is too large'),
  frequency: z.enum(['MONTHLY', 'WEEKLY']),
  notes: optionalTextSchema,
});

export const updateInstallmentPlanSchema = z.object({
  totalAmount: moneySchema,
  description: z.string().trim().min(1, 'Description is required'),
  startDate: businessDateSchema,
  installmentCount: z
    .number()
    .int('Installment count must be a whole number')
    .positive('Installment count must be positive')
    .max(120, 'Installment count is too large'),
  notes: optionalTextSchema,
  reason: optionalReasonSchema,
});

export const installmentPlanPaymentSchema = (remainingBalance: string) =>
  z.object({
    amount: moneySchema.refine(
      (value) => isMoneyLessThanOrEqual(value, remainingBalance),
      'Payment cannot exceed the remaining balance'
    ),
    paymentDate: businessDateSchema,
    paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHECK', 'OTHER']),
    reference: optionalTextSchema,
    notes: optionalTextSchema,
  });

export type CreateDebtFormValues = z.infer<typeof createDebtSchema>;
export type CreatePrepaidPurchaseFormValues = z.infer<typeof createPrepaidPurchaseSchema>;
export type DebtPaymentFormValues = z.infer<ReturnType<typeof debtPaymentSchema>>;
export type UpdateDebtFormValues = z.infer<typeof updateDebtSchema>;
export type CancelFinancialRecordFormValues = z.infer<typeof cancelFinancialRecordSchema>;
export type VoidPaymentFormValues = z.infer<typeof voidPaymentSchema>;
export type CreateInstallmentPlanFormValues = z.infer<typeof createInstallmentPlanSchema>;
export type UpdateInstallmentPlanFormValues = z.infer<typeof updateInstallmentPlanSchema>;
export type InstallmentPlanPaymentFormValues = z.infer<
  ReturnType<typeof installmentPlanPaymentSchema>
>;
