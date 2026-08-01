import { z } from 'zod';

export const productFormSchema = z.object({ name: z.string().trim().min(1).max(200), model: z.string().trim().min(1).max(120), brand: z.string().trim().max(120).optional(), barcode: z.string().trim().max(64).optional(), price: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/).optional() });
export const serviceJobProductSchema = z.object({ productId: z.string().uuid().nullable().optional(), manualProductName: z.string().trim().max(200).nullable().optional() }).refine((value) => Boolean(value.productId) !== Boolean(value.manualProductName), { message: 'Choose an existing product or enter one manually' });
