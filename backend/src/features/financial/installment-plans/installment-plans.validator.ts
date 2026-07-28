import {
  FinancialCorrectionSourceScreen,
  InstallmentPlanFrequency,
  InstallmentPlanStatus,
  PaymentMethod,
} from '@prisma/client';
import { z } from 'zod';
import { userTextSchema } from '../../../validators/user-text';

const uuidSchema = z.string().uuid('Invalid ID');
const moneyStringSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, 'Amount must be a decimal string with up to 2 decimal places')
  .refine((value) => !/^0(?:\.0{1,2})?$/.test(value), 'Amount must be greater than zero');
const businessDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

export const customerInstallmentPlanParamsSchema = z.object({
  customerId: uuidSchema,
});

export const installmentPlanParamsSchema = z.object({
  planId: uuidSchema,
});

export const createInstallmentPlanSchema = z
  .object({
    totalAmount: moneyStringSchema,
    description: userTextSchema({ field: 'Description', min: 1, max: 200 }),
    startDate: businessDateSchema,
    installmentCount: z.coerce.number().int().positive().max(120, 'Installment count is too large'),
    frequency: z.nativeEnum(InstallmentPlanFrequency).default(InstallmentPlanFrequency.MONTHLY),
    notes: userTextSchema({ field: 'Notes', max: 1000 }).optional().nullable(),
    schedule: z
      .array(
        z
          .object({
            amountDue: moneyStringSchema,
          })
          .strict()
      )
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.schedule && value.schedule.length !== value.installmentCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schedule'],
        message: 'Manual schedule must have one amount for each installment',
      });
    }
  });

export const listCustomerInstallmentPlansQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.nativeEnum(InstallmentPlanStatus).optional(),
  includeCancelled: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true')
    .default(false),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const createInstallmentPlanPaymentSchema = z
  .object({
    amount: moneyStringSchema,
    paymentDate: businessDateSchema,
    paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
    reference: userTextSchema({ field: 'Reference', max: 100 }).optional().nullable(),
    notes: userTextSchema({ field: 'Notes', max: 1000 }).optional().nullable(),
    idempotencyKey: z.string().trim().max(128, 'Idempotency key is too long').optional().nullable(),
  })
  .strict();

export const cancelInstallmentPlanSchema = z
  .object({
    reason: userTextSchema({ field: 'Cancellation reason', min: 1, max: 1000 }),
    accountPassword: z.string().min(1, 'Account password is required'),
  })
  .strict();

export const updateInstallmentPlanSchema = z
  .object({
    totalAmount: moneyStringSchema.optional(),
    description: userTextSchema({ field: 'Description', min: 1, max: 200 }),
    startDate: businessDateSchema.optional(),
    installmentCount: z.coerce.number().int().positive().max(120, 'Installment count is too large').optional(),
    notes: userTextSchema({ field: 'Notes', max: 1000 }).optional().nullable(),
    cancelReason: userTextSchema({ field: 'Cancellation reason', min: 5, max: 1000 }).optional().nullable(),
    schedule: z
      .array(
        z
          .object({
            amountDue: moneyStringSchema,
          })
          .strict()
      )
      .optional(),
    reason: userTextSchema({ field: 'Correction reason', min: 5, max: 1000 }),
    sourceScreen: z.nativeEnum(FinancialCorrectionSourceScreen).default(FinancialCorrectionSourceScreen.API),
    accountPassword: z.string().min(1, 'Account password is required'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.schedule && value.installmentCount && value.schedule.length !== value.installmentCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schedule'],
        message: 'Manual schedule must have one amount for each installment',
      });
    }
  });

export type CustomerInstallmentPlanParamsInput = z.infer<typeof customerInstallmentPlanParamsSchema>;
export type InstallmentPlanParamsInput = z.infer<typeof installmentPlanParamsSchema>;
export type CreateInstallmentPlanInput = z.infer<typeof createInstallmentPlanSchema>;
export type ListCustomerInstallmentPlansQueryInput = z.infer<typeof listCustomerInstallmentPlansQuerySchema>;
export type CreateInstallmentPlanPaymentInput = z.infer<typeof createInstallmentPlanPaymentSchema>;
export type CancelInstallmentPlanInput = z.infer<typeof cancelInstallmentPlanSchema>;
export type UpdateInstallmentPlanInput = z.infer<typeof updateInstallmentPlanSchema>;
