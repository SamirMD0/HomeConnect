import { InstallmentPlanFrequency, InstallmentPlanStatus, PaymentMethod } from '@prisma/client';
import { z } from 'zod';

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
    description: z.string().trim().min(1, 'Description is required').max(200, 'Description is too long'),
    startDate: businessDateSchema,
    installmentCount: z.coerce.number().int().positive().max(120, 'Installment count is too large'),
    frequency: z.nativeEnum(InstallmentPlanFrequency).default(InstallmentPlanFrequency.MONTHLY),
    notes: z.string().trim().max(1000, 'Notes are too long').optional().nullable(),
  })
  .strict();

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
    reference: z.string().trim().max(100, 'Reference is too long').optional().nullable(),
    notes: z.string().trim().max(1000, 'Notes are too long').optional().nullable(),
    idempotencyKey: z.string().trim().max(128, 'Idempotency key is too long').optional().nullable(),
  })
  .strict();

export const cancelInstallmentPlanSchema = z
  .object({
    reason: z.string().trim().min(1, 'Cancellation reason is required').max(1000, 'Cancellation reason is too long'),
  })
  .strict();

export type CustomerInstallmentPlanParamsInput = z.infer<typeof customerInstallmentPlanParamsSchema>;
export type InstallmentPlanParamsInput = z.infer<typeof installmentPlanParamsSchema>;
export type CreateInstallmentPlanInput = z.infer<typeof createInstallmentPlanSchema>;
export type ListCustomerInstallmentPlansQueryInput = z.infer<typeof listCustomerInstallmentPlansQuerySchema>;
export type CreateInstallmentPlanPaymentInput = z.infer<typeof createInstallmentPlanPaymentSchema>;
export type CancelInstallmentPlanInput = z.infer<typeof cancelInstallmentPlanSchema>;
