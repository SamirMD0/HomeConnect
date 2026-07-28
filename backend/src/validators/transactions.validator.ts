import { z } from 'zod';
import { userTextSchema } from './user-text';

export const createTransactionSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID').optional(),
  customerName: userTextSchema({ field: 'Customer name', max: 100 }).optional(),
  customerPhone: z.string().optional(),
  type: z.enum(['ONE_TIME', 'INSTALLMENT', 'PAYMENT', 'ADJUSTMENT']),
  amount: z.number().positive('Amount must be positive'),
  description: userTextSchema({ field: 'Description', min: 1, max: 255 }),
  date: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional().nullable(),
  referenceNumber: userTextSchema({ field: 'Reference number', max: 100 }).optional().nullable(),
  metadata: z.any().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
}).refine(data => data.customerId || (data.customerName && data.customerPhone), {
  message: "Either customerId or both customerName and customerPhone are required",
  path: ["customerId"]
});

export const updateTransactionSchema = z.object({
  amount: z.number().positive('Amount must be positive').optional(),
  description: userTextSchema({ field: 'Description', min: 1, max: 255 }).optional(),
  date: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional().nullable(),
  referenceNumber: userTextSchema({ field: 'Reference number', max: 100 }).optional().nullable(),
  metadata: z.any().optional().nullable(),
});

export const transactionQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1').transform(Number),
  limit: z.string().regex(/^\d+$/).optional().default('10').transform(Number),
  customerId: z.string().uuid().optional(),
  type: z.enum(['ONE_TIME', 'INSTALLMENT', 'PAYMENT', 'ADJUSTMENT']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const transactionParamsSchema = z.object({
  id: z.string().uuid('Invalid transaction ID'),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionQueryInput = z.infer<typeof transactionQuerySchema>;
export type TransactionParamsInput = z.infer<typeof transactionParamsSchema>;
