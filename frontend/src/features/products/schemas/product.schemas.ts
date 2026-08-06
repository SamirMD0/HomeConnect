import { z } from 'zod';
import { moneyToCents } from '../../customer-financial/utils/money-input';

const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

const optionalMoney = z.string().trim().refine(
  (value) => value === '' || moneyPattern.test(value),
  'Use a non-negative amount with up to two decimals'
);

export const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(200, 'Product name is too long'),
  model: z.string().trim().min(1, 'Model is required').max(120, 'Model is too long'),
  brand: z.string().trim().max(120, 'Brand is too long'),
  barcode: z.string().trim().refine(
    (value) => value === '' || (/^[A-Za-z0-9-]{4,64}$/).test(value),
    'Barcode must be 4–64 letters, numbers, or hyphens'
  ),
  price: optionalMoney,
  discount: optionalMoney,
  imageUrl: z.string().trim().max(2048, 'Image URL is too long').refine(
    (value) => {
      if (value === '') return true;
      try {
        const { protocol } = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    },
    'Enter a valid http:// or https:// image link'
  ),
  notes: z.string().trim().max(2000, 'Notes are too long'),
}).superRefine((values, context) => {
  if (!values.price || !values.discount) return;
  if (moneyToCents(values.discount) > moneyToCents(values.price)) {
    context.addIssue({ code: 'custom', path: ['discount'], message: 'Discount amount cannot exceed price' });
  }
});

export const productCorrectionSchema = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
  accountPassword: z.string().min(1, 'Account password is required'),
});

export const productPricingModeFormSchema = z.object({
  mode: z.enum(['PRESET', 'CUSTOM', 'MANUAL', 'NONE']),
  costPrice: z.string(),
  price: z.string(),
}).superRefine((values, context) => {
  if ((values.mode === 'PRESET' || values.mode === 'CUSTOM') && !values.costPrice.trim()) {
    context.addIssue({ code: 'custom', path: ['costPrice'], message: 'Cost price is required / سعر التكلفة مطلوب' });
  }
  if (values.mode === 'MANUAL' && !values.price.trim()) {
    context.addIssue({ code: 'custom', path: ['price'], message: 'Manual price is required / السعر اليدوي مطلوب' });
  }
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
export type ProductCorrectionValues = z.infer<typeof productCorrectionSchema>;
