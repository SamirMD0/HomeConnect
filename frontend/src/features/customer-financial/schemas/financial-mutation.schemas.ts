import { z } from 'zod';
import { isStrictBusinessDate } from '../utils/business-date';
import { isValidMoneyInput, isMoneyLessThanOrEqual } from '../utils/money-input';

const moneySchema = z
  .string()
  .trim()
  .min(1, 'Amount is required')
  .refine(isValidMoneyInput, 'Enter a positive amount with up to two decimals');

const businessDateSchema = z
  .string()
  .trim()
  .min(1, 'Date is required')
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

export const updateDebtSchema = z.object({
  originalAmount: moneySchema,
  description: z.string().trim().min(1, 'Description is required'),
  dueDate: businessDateSchema,
  notes: optionalTextSchema,
  reason: z.string().trim().min(5, 'Correction reason must be at least 5 characters'),
  accountPassword: z.string().min(1, 'Account password is required'),
});

export const cancelFinancialRecordSchema = z.object({
  reason: z.string().trim().min(1, 'Cancellation reason is required'),
  accountPassword: z.string().min(1, 'Account password is required'),
});

export const voidPaymentSchema = z.object({
  reason: z.string().trim().min(5, 'Void reason must be at least 5 characters'),
  accountPassword: z.string().min(1, 'Account password is required'),
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
  frequency: z.literal('MONTHLY'),
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
  reason: z.string().trim().min(5, 'Correction reason must be at least 5 characters'),
  accountPassword: z.string().min(1, 'Account password is required'),
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
export type DebtPaymentFormValues = z.infer<ReturnType<typeof debtPaymentSchema>>;
export type UpdateDebtFormValues = z.infer<typeof updateDebtSchema>;
export type CancelFinancialRecordFormValues = z.infer<typeof cancelFinancialRecordSchema>;
export type VoidPaymentFormValues = z.infer<typeof voidPaymentSchema>;
export type CreateInstallmentPlanFormValues = z.infer<typeof createInstallmentPlanSchema>;
export type UpdateInstallmentPlanFormValues = z.infer<typeof updateInstallmentPlanSchema>;
export type InstallmentPlanPaymentFormValues = z.infer<
  ReturnType<typeof installmentPlanPaymentSchema>
>;
