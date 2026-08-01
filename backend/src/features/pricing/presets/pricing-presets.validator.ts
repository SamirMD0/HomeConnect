import { PricingCalculationMode, PricingRoundingMode } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { z } from 'zod';
import { userTextSchema } from '../../../validators/user-text';
import { containsSensitivePricingPresetFields } from '../authorization/pricing-policy';

const emptyToNull = (value: unknown) => typeof value === 'string' && value.trim() === '' ? null : value;
const percentPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;
const percent = (field: string, max = 999.999) => z.string().trim()
  .regex(percentPattern, `${field} must be a non-negative decimal with up to 3 decimal places`)
  .refine((value) => new Decimal(value).lessThanOrEqualTo(max.toString()), `${field} cannot exceed ${max}`);
const optionalText = (field: string, max: number) => z.preprocess(
  emptyToNull,
  userTextSchema({ field, max }).optional().nullable()
);
const reason = userTextSchema({ field: 'Reason', min: 5, max: 1000 });

const formulaFields = {
  expensePercent: percent('Expenses percentage'),
  profitPercent: percent('Profit percentage'),
  discountBufferPercent: percent('Discount buffer percentage'),
  installmentMarkupPercent: percent('Installment markup percentage'),
  downPaymentPercent: percent('Down payment percentage', 100),
  defaultInstallmentMonths: z.coerce.number().int().min(1).max(120),
  calculationMode: z.nativeEnum(PricingCalculationMode).default(PricingCalculationMode.COMPOUND),
  roundingMode: z.nativeEnum(PricingRoundingMode).default(PricingRoundingMode.NONE),
};

export const createPricingPresetSchema = z.object({
  name: userTextSchema({ field: 'Preset name', min: 1, max: 200 }),
  productType: optionalText('Product type', 120),
  ...formulaFields,
  notes: optionalText('Notes', 2000),
  reason,
  accountPassword: z.string().min(1, 'Account password is required'),
}).strict();

export const updatePricingPresetSchema = z.object({
  name: userTextSchema({ field: 'Preset name', min: 1, max: 200 }).optional(),
  productType: optionalText('Product type', 120),
  expensePercent: formulaFields.expensePercent.optional(),
  profitPercent: formulaFields.profitPercent.optional(),
  discountBufferPercent: formulaFields.discountBufferPercent.optional(),
  installmentMarkupPercent: formulaFields.installmentMarkupPercent.optional(),
  downPaymentPercent: formulaFields.downPaymentPercent.optional(),
  defaultInstallmentMonths: formulaFields.defaultInstallmentMonths.optional(),
  calculationMode: z.nativeEnum(PricingCalculationMode).optional(),
  roundingMode: z.nativeEnum(PricingRoundingMode).optional(),
  notes: optionalText('Notes', 2000),
  reason,
  accountPassword: z.string().min(1, 'Account password is required').optional(),
}).strict().superRefine((values, context) => {
  const fields = mutationFields(values);
  if (fields.length === 0) context.addIssue({ code: 'custom', message: 'At least one preset field is required' });
  if (containsSensitivePricingPresetFields(fields) && !values.accountPassword) {
    context.addIssue({ code: 'custom', path: ['accountPassword'], message: 'Account password is required for formula changes' });
  }
});

export const pricingPresetActionSchema = z.object({ reason, accountPassword: z.string().min(1, 'Account password is required') }).strict();
export const pricingPresetParamsSchema = z.object({ presetId: z.string().uuid('Invalid pricing preset ID') });
export const pricingPresetListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  productType: z.string().trim().max(120).optional(),
  isActive: z.enum(['true', 'false']).optional().transform((value) => value === undefined ? undefined : value === 'true'),
  sortBy: z.enum(['name', 'productType', 'createdAt', 'updatedAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
export const pricingPresetAuditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export type CreatePricingPresetInput = z.infer<typeof createPricingPresetSchema>;
export type UpdatePricingPresetInput = z.infer<typeof updatePricingPresetSchema>;
export type PricingPresetActionInput = z.infer<typeof pricingPresetActionSchema>;
export type PricingPresetParamsInput = z.infer<typeof pricingPresetParamsSchema>;
export type PricingPresetListQueryInput = z.infer<typeof pricingPresetListQuerySchema>;
export type PricingPresetAuditQueryInput = z.infer<typeof pricingPresetAuditQuerySchema>;

export function mutationFields(value: object): string[] {
  return Object.keys(value).filter((field) => !['reason', 'accountPassword'].includes(field));
}
