import { DebtStatus, PaymentMethod } from '@prisma/client';
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

export const customerDebtParamsSchema = z.object({
  customerId: uuidSchema,
});

export const debtParamsSchema = z.object({
  debtId: uuidSchema,
});

export const createDebtSchema = z
  .object({
    amount: moneyStringSchema,
    description: z.string().trim().min(1, 'Description is required').max(200, 'Description is too long'),
    dueDate: businessDateSchema,
    notes: z.string().trim().max(1000, 'Notes are too long').optional().nullable(),
  })
  .strict();

export const listCustomerDebtsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.nativeEnum(DebtStatus).optional(),
  includeCancelled: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true')
    .default(false),
  sortBy: z.enum(['dueDate', 'createdAt']).optional().default('dueDate'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const createDebtPaymentSchema = z
  .object({
    amount: moneyStringSchema,
    paymentDate: businessDateSchema,
    paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
    reference: z.string().trim().max(100, 'Reference is too long').optional().nullable(),
    notes: z.string().trim().max(1000, 'Notes are too long').optional().nullable(),
    idempotencyKey: z.string().trim().max(128, 'Idempotency key is too long').optional().nullable(),
  })
  .strict();

export const cancelDebtSchema = z
  .object({
    reason: z.string().trim().min(1, 'Cancellation reason is required').max(1000, 'Cancellation reason is too long'),
  })
  .strict();

export type CustomerDebtParamsInput = z.infer<typeof customerDebtParamsSchema>;
export type DebtParamsInput = z.infer<typeof debtParamsSchema>;
export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type ListCustomerDebtsQueryInput = z.infer<typeof listCustomerDebtsQuerySchema>;
export type CreateDebtPaymentInput = z.infer<typeof createDebtPaymentSchema>;
export type CancelDebtInput = z.infer<typeof cancelDebtSchema>;
