import { z } from 'zod';

export const moneyStringSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, 'Use a decimal amount with up to two places');
export const salesOrderLineSchema = z.object({
  productId: z.string().uuid().optional().nullable(), manualProductName: z.string().trim().min(2).max(200).optional().nullable(),
  manualProductModel: z.string().trim().max(120).optional().nullable(), quantity: z.number().int().min(1).max(999),
  unitPrice: moneyStringSchema, discountAmount: moneyStringSchema.optional().nullable(), notes: z.string().trim().max(1000).optional().nullable(),
}).superRefine((value, context) => {
  if (Boolean(value.productId) === Boolean(value.manualProductName)) context.addIssue({ code: 'custom', path: ['productId'], message: 'Choose a catalog product or enter a manual name' });
});
export const createSalesOrderClientSchema = z.object({
  customerId: z.string().uuid().optional().nullable(), orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), paidAmount: moneyStringSchema,
  items: z.array(salesOrderLineSchema).min(1).max(50),
});
