import { FinancialCorrectionSourceScreen, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { userTextSchema } from '../../../validators/user-text';

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
    reason: userTextSchema({ field: 'Void reason', min: 5, max: 1000 }),
    sourceScreen: z.nativeEnum(FinancialCorrectionSourceScreen).default(FinancialCorrectionSourceScreen.API),
    accountPassword: z.string().min(1, 'Account password is required'),
  })
  .strict();

export const correctPaymentSchema = z
  .object({
    amount: moneyStringSchema.optional(),
    paymentDate: businessDateSchema,
    paymentMethod: z.nativeEnum(PaymentMethod),
    reference: userTextSchema({ field: 'Reference', max: 100 }).optional().nullable(),
    notes: userTextSchema({ field: 'Notes', max: 1000 }).optional().nullable(),
    reason: userTextSchema({ field: 'Correction reason', min: 5, max: 1000 }),
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
    reason: userTextSchema({ field: 'Correction reason', min: 5, max: 1000 }),
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
