import { PricingCalculationMode, PricingRoundingMode } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { z } from 'zod';

const percentPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;
const percent = (max = '999.999') => z.string().trim().regex(percentPattern).refine((value) => new Decimal(value).lessThanOrEqualTo(max));
const overrideSchema = z.object({
  expensePercent: percent().optional(), profitPercent: percent().optional(), discountBufferPercent: percent().optional(),
  installmentMarkupPercent: percent().optional(), downPaymentPercent: percent('100').optional(),
  calculationMode: z.nativeEnum(PricingCalculationMode).optional(), roundingMode: z.nativeEnum(PricingRoundingMode).optional(),
}).strict();

export const pricingCalculateSchema = z.object({
  costPrice: z.string().trim().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/).refine((value) => new Decimal(value).greaterThan(0)),
  presetId: z.string().uuid().optional(),
  overrides: overrideSchema.optional(),
  installmentMonths: z.coerce.number().int().min(1).max(120).optional(),
}).strict();
export type PricingCalculateInput = z.infer<typeof pricingCalculateSchema>;
