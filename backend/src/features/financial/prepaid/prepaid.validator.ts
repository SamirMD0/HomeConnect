import { z } from 'zod';
import { PrepaidPurchaseStatus } from '@prisma/client';
import { userTextSchema } from '../../../validators/user-text';

const uuidSchema = z.string().uuid('Invalid identifier');
const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use the YYYY-MM-DD format');

export const prepaidParamsSchema = z.object({
  id: uuidSchema,
});

export const prepaidListQuerySchema = z.object({
  status: z.enum(['ALL', 'PENDING', 'DELIVERED', 'CANCELLED']).default('PENDING'),
  customerId: uuidSchema.optional(),
  search: z.string().trim().max(200).optional(),
  dateFrom: businessDateSchema.optional(),
  dateTo: businessDateSchema.optional(),
  fullyPaidOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  sortBy: z.enum(['createdAt', 'customerName', 'adminDebt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const deliverPrepaidSchema = z
  .object({
    remainderDueDate: businessDateSchema.optional().nullable(),
    deliveryNotes: userTextSchema({ field: 'Delivery notes', max: 1000 }).optional().nullable(),
  })
  .strict();

export const revertPrepaidDeliverySchema = z
  .object({
    reason: userTextSchema({ field: 'Reason', min: 5, max: 1000 }),
    accountPassword: z.string().min(1, 'Account password is required'),
  })
  .strict();

export type PrepaidParamsInput = z.infer<typeof prepaidParamsSchema>;
export type PrepaidListQueryInput = z.infer<typeof prepaidListQuerySchema>;
export type DeliverPrepaidInput = z.infer<typeof deliverPrepaidSchema>;
export type RevertPrepaidDeliveryInput = z.infer<typeof revertPrepaidDeliverySchema>;

export const PREPAID_STATUS_VALUES = Object.values(PrepaidPurchaseStatus);
