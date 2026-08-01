import { PricingCalculationMode, PricingPreset, PricingRoundingMode, Product } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { calculatePricing } from '../domain/pricing-calculator';
import { percentToApiString } from '../domain/pricing-percent';
import { PricingConfig } from '../domain/pricing-types';

export type PricingUnavailableReason = 'MISSING_COST_PRICE' | 'MISSING_PRESET' | 'NO_DEFAULT_PRESET' | 'INCOMPLETE_CUSTOM_PRICING';
export type PricingSource = 'PRESET' | 'CUSTOM' | 'DEFAULT_PRESET';

export type ProductPricingRecord = Product & { pricingPreset?: PricingPreset | null };

export function resolveProductPricing(product: ProductPricingRecord, defaultPreset: PricingPreset | null, installmentMonths?: number) {
  if (!product.costPrice) return unavailable('MISSING_COST_PRICE');

  const resolved = product.useCustomPricing
    ? resolveCustom(product, defaultPreset, installmentMonths)
    : resolvePreset(product, defaultPreset, installmentMonths);
  if ('pricingAvailable' in resolved) return resolved;

  const result = calculatePricing(new Decimal(product.costPrice.toString()), resolved.config);
  return {
    pricingAvailable: true as const,
    source: resolved.source,
    preset: resolved.preset ? { id: resolved.preset.id, name: resolved.preset.name, isArchived: Boolean(resolved.preset.archivedAt) } : null,
    calculationMode: resolved.config.calculationMode,
    roundingMode: resolved.config.roundingMode,
    inputs: {
      costPrice: new Decimal(product.costPrice.toString()).toFixed(2),
      expensePercent: percentToApiString(resolved.config.expensePercent),
      profitPercent: percentToApiString(resolved.config.profitPercent),
      discountBufferPercent: percentToApiString(resolved.config.discountBufferPercent),
      installmentMarkupPercent: percentToApiString(resolved.config.installmentMarkupPercent),
      downPaymentPercent: percentToApiString(resolved.config.downPaymentPercent),
      installmentMonths: resolved.config.installmentMonths,
    },
    breakdown: {
      expensesAmount: result.expensesAmount,
      profitAmount: result.profitAmount,
      discountBufferAmount: result.discountBufferAmount,
    },
    cashPrice: result.cashPrice,
    installment: {
      installmentPrice: result.installmentPrice,
      downPayment: result.downPayment,
      remaining: result.remaining,
      monthlyPayment: result.monthlyPayment,
      lastInstallmentPayment: result.lastInstallmentPayment,
      installmentMonths: result.installmentMonths,
    },
    warnings: resolved.preset?.archivedAt ? ['PRESET_ARCHIVED' as const] : [],
  };
}

function resolveCustom(product: ProductPricingRecord, defaultPreset: PricingPreset | null, months?: number) {
  const values = [product.customExpensePercent, product.customProfitPercent, product.customDiscountBufferPercent, product.customInstallmentMarkupPercent, product.customDownPaymentPercent];
  if (values.some((value) => value == null) || !product.customInstallmentMonths || !product.customCalculationMode) {
    return unavailable('INCOMPLETE_CUSTOM_PRICING');
  }
  const roundingPreset = product.pricingPreset ?? defaultPreset;
  return {
    source: 'CUSTOM' as const,
    preset: product.pricingPreset ?? null,
    config: {
      expensePercent: decimal(product.customExpensePercent!), profitPercent: decimal(product.customProfitPercent!),
      discountBufferPercent: decimal(product.customDiscountBufferPercent!), installmentMarkupPercent: decimal(product.customInstallmentMarkupPercent!),
      downPaymentPercent: decimal(product.customDownPaymentPercent!), installmentMonths: months ?? product.customInstallmentMonths,
      calculationMode: product.customCalculationMode as PricingCalculationMode,
      roundingMode: (roundingPreset?.roundingMode ?? PricingRoundingMode.NONE) as PricingRoundingMode,
    } satisfies PricingConfig,
  };
}

function resolvePreset(product: ProductPricingRecord, defaultPreset: PricingPreset | null, months?: number) {
  if (product.pricingPresetId && !product.pricingPreset) return unavailable('MISSING_PRESET');
  const preset = product.pricingPreset ?? defaultPreset;
  if (!preset) return unavailable('NO_DEFAULT_PRESET');
  return {
    source: product.pricingPreset ? 'PRESET' as const : 'DEFAULT_PRESET' as const,
    preset,
    config: presetConfig(preset, months),
  };
}

export function presetConfig(preset: PricingPreset, installmentMonths?: number): PricingConfig {
  return {
    expensePercent: decimal(preset.expensePercent), profitPercent: decimal(preset.profitPercent),
    discountBufferPercent: decimal(preset.discountBufferPercent), installmentMarkupPercent: decimal(preset.installmentMarkupPercent),
    downPaymentPercent: decimal(preset.downPaymentPercent), installmentMonths: installmentMonths ?? preset.defaultInstallmentMonths,
    calculationMode: preset.calculationMode, roundingMode: preset.roundingMode,
  };
}

const decimal = (value: { toString(): string }) => new Decimal(value.toString());
const unavailable = (reason: PricingUnavailableReason) => ({ pricingAvailable: false as const, reason });
