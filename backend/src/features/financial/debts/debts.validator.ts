import { DebtStatus, FinancialCorrectionSourceScreen, PaymentMethod } from '@prisma/client';
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

export const customerDebtParamsSchema = z.object({
  customerId: uuidSchema,
});

export const debtParamsSchema = z.object({
  debtId: uuidSchema,
});

export const createDebtSchema = z
  .object({
    amount: moneyStringSchema,
    description: userTextSchema({ field: 'Description', min: 1, max: 200 }),
    dueDate: businessDateSchema,
    notes: userTextSchema({ field: 'Notes', max: 1000 }).optional().nullable(),
  })
  .strict();

export const createPrepaidPurchaseSchema = z
  .object({
    itemName: userTextSchema({ field: 'Item name', min: 1, max: 200 }),
    paymentAmount: moneyStringSchema,
    fullAmount: moneyStringSchema,
    notes: userTextSchema({ field: 'Notes', max: 1000 }).optional().nullable(),
  })
  .superRefine((input, context) => {
    const paymentCents = moneyToCents(input.paymentAmount);
    const fullCents = moneyToCents(input.fullAmount);
    if (paymentCents > fullCents) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paymentAmount'],
        message: 'Payment cannot exceed the full amount',
      });
    }
  });

export const updateDebtSchema = z
  .object({
    originalAmount: moneyStringSchema.optional(),
    description: userTextSchema({ field: 'Description', min: 1, max: 200 }),
    dueDate: businessDateSchema,
    notes: userTextSchema({ field: 'Notes', max: 1000 }).optional().nullable(),
    cancelReason: userTextSchema({ field: 'Cancellation reason', min: 5, max: 1000 }).optional().nullable(),
    reason: userTextSchema({ field: 'Correction reason', min: 5, max: 1000 }),
    sourceScreen: z.nativeEnum(FinancialCorrectionSourceScreen).default(FinancialCorrectionSourceScreen.API),
    accountPassword: z.string().min(1, 'Account password is required'),
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
    reference: userTextSchema({ field: 'Reference', max: 100 }).optional().nullable(),
    notes: userTextSchema({ field: 'Notes', max: 1000 }).optional().nullable(),
    idempotencyKey: z.string().trim().max(128, 'Idempotency key is too long').optional().nullable(),
  })
  .strict();

export const cancelDebtSchema = z
  .object({
    reason: userTextSchema({ field: 'Cancellation reason', min: 1, max: 1000 }),
    accountPassword: z.string().min(1, 'Account password is required'),
  })
  .strict();

export type CustomerDebtParamsInput = z.infer<typeof customerDebtParamsSchema>;
export type DebtParamsInput = z.infer<typeof debtParamsSchema>;
export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type CreatePrepaidPurchaseInput = z.infer<typeof createPrepaidPurchaseSchema>;
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;
export type ListCustomerDebtsQueryInput = z.infer<typeof listCustomerDebtsQuerySchema>;
export type CreateDebtPaymentInput = z.infer<typeof createDebtPaymentSchema>;
export type CancelDebtInput = z.infer<typeof cancelDebtSchema>;

function moneyToCents(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
