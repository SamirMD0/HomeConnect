import { FinancialCorrectionSourceScreen, PaymentMethod } from '@prisma/client';
import { z } from 'zod';

const uuidSchema = z.string().uuid('Invalid ID');
const businessDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

const moneyStringSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, 'Amount must be a decimal string with up to 2 decimal places')
  .refine((value) => !/^0(?:\.0{1,2})?$/.test(value), 'Amount must be greater than zero');

export const paymentParamsSchema = z.object({
  paymentId: uuidSchema,
});

export const voidPaymentSchema = z
  .object({
    reason: z.string().trim().min(5, 'Void reason must be at least 5 characters').max(1000, 'Void reason is too long'),
    sourceScreen: z.nativeEnum(FinancialCorrectionSourceScreen).default(FinancialCorrectionSourceScreen.API),
    accountPassword: z.string().min(1, 'Account password is required'),
  })
  .strict();

export const correctPaymentSchema = z
  .object({
    amount: moneyStringSchema.optional(),
    paymentDate: businessDateSchema,
    paymentMethod: z.nativeEnum(PaymentMethod),
    reference: z.string().trim().max(100, 'Reference is too long').optional().nullable(),
    notes: z.string().trim().max(1000, 'Notes are too long').optional().nullable(),
    reason: z.string().trim().min(5, 'Correction reason must be at least 5 characters').max(1000, 'Correction reason is too long'),
    sourceScreen: z.nativeEnum(FinancialCorrectionSourceScreen).default(FinancialCorrectionSourceScreen.API),
    accountPassword: z.string().min(1, 'Account password is required'),
  })
  .strict();

export const reallocatePaymentSchema = z
  .object({
    allocations: z
      .array(
        z
          .object({
            installmentId: uuidSchema,
            amount: moneyStringSchema,
          })
          .strict()
      )
      .min(1, 'At least one allocation is required')
      .max(120, 'Too many allocations'),
    reason: z.string().trim().min(5, 'Correction reason must be at least 5 characters').max(1000, 'Correction reason is too long'),
    sourceScreen: z.nativeEnum(FinancialCorrectionSourceScreen).default(FinancialCorrectionSourceScreen.API),
    accountPassword: z.string().min(1, 'Account password is required'),
  })
  .strict()
  .superRefine((value, context) => {
    const installmentIds = new Set<string>();
    value.allocations.forEach((allocation, index) => {
      if (installmentIds.has(allocation.installmentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['allocations', index, 'installmentId'],
          message: 'Installment allocations must not contain duplicate installments',
        });
      }
      installmentIds.add(allocation.installmentId);
    });
  });

export type PaymentParamsInput = z.infer<typeof paymentParamsSchema>;
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;
export type CorrectPaymentInput = z.infer<typeof correctPaymentSchema>;
export type ReallocatePaymentInput = z.infer<typeof reallocatePaymentSchema>;
