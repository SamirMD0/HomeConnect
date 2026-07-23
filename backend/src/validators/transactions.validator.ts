import { z } from 'zod';

export const createTransactionSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID').optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  type: z.enum(['SALE', 'PAYMENT', 'ADJUSTMENT']),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required').max(255, 'Description is too long'),
  date: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  metadata: z.any().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
}).refine(data => data.customerId || (data.customerName && data.customerPhone), {
  message: "Either customerId or both customerName and customerPhone are required",
  path: ["customerId"]
});

export const updateTransactionSchema = z.object({
  amount: z.number().positive('Amount must be positive').optional(),
  description: z.string().min(1, 'Description is required').max(255, 'Description is too long').optional(),
  date: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  metadata: z.any().optional().nullable(),
});

export const transactionQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1').transform(Number),
  limit: z.string().regex(/^\d+$/).optional().default('10').transform(Number),
  customerId: z.string().uuid().optional(),
  type: z.enum(['SALE', 'PAYMENT', 'ADJUSTMENT']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionQueryInput = z.infer<typeof transactionQuerySchema>;
