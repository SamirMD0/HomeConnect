import { PricingCalculationMode, PricingRoundingMode } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { resolveProductPricing } from './pricing-resolution';

const preset = { id: '11111111-1111-4111-8111-111111111111', name: 'AC', productType: null, expensePercent: new Decimal(10), profitPercent: new Decimal(7), discountBufferPercent: new Decimal(7), installmentMarkupPercent: new Decimal(20), downPaymentPercent: new Decimal(40), defaultInstallmentMonths: 3, calculationMode: PricingCalculationMode.COMPOUND, roundingMode: PricingRoundingMode.NONE, isDefault: false, isActive: true, notes: null, archivedAt: null, archivedReason: null, createdById: 'u', updatedById: null, createdAt: new Date(), updatedAt: new Date() };
const product = { id: 'p', name: 'AC', model: 'A1', barcode: null, brand: null, price: null, discount: null, costPrice: new Decimal(300), pricingPresetId: preset.id, pricingPreset: preset, useCustomPricing: false, installmentEnabled: true, customExpensePercent: null, customProfitPercent: null, customDiscountBufferPercent: null, customInstallmentMarkupPercent: null, customDownPaymentPercent: null, customInstallmentMonths: null, customCalculationMode: null, isActive: true, notes: null, createdById: 'u', updatedById: null, createdAt: new Date(), updatedAt: new Date() };

describe('product pricing resolution', () => {
  it('uses an explicit preset', () => expect(resolveProductPricing(product as never, null)).toMatchObject({ pricingAvailable: true, source: 'PRESET', cashPrice: '377.82' }));
  it('falls back to the default preset', () => expect(resolveProductPricing({ ...product, pricingPresetId: null, pricingPreset: null } as never, preset as never)).toMatchObject({ pricingAvailable: true, source: 'DEFAULT_PRESET' }));
  it('reports normal unavailable states', () => {
    expect(resolveProductPricing({ ...product, costPrice: null } as never, null)).toEqual({ pricingAvailable: false, reason: 'MISSING_COST_PRICE' });
    expect(resolveProductPricing({ ...product, pricingPresetId: null, pricingPreset: null } as never, null)).toEqual({ pricingAvailable: false, reason: 'NO_DEFAULT_PRESET' });
  });
  it('uses complete custom pricing and warns for archived attached presets', () => {
    const result = resolveProductPricing({ ...product, useCustomPricing: true, pricingPreset: { ...preset, archivedAt: new Date() }, customExpensePercent: new Decimal(1), customProfitPercent: new Decimal(2), customDiscountBufferPercent: new Decimal(3), customInstallmentMarkupPercent: new Decimal(4), customDownPaymentPercent: new Decimal(5), customInstallmentMonths: 6, customCalculationMode: PricingCalculationMode.SIMPLE } as never, null);
    expect(result).toMatchObject({ pricingAvailable: true, source: 'CUSTOM', warnings: ['PRESET_ARCHIVED'] });
  });
  it('calculates cash-only custom pricing without installment configuration', () => {
    const result = resolveProductPricing({
      ...product, useCustomPricing: true, installmentEnabled: false,
      customExpensePercent: new Decimal(1), customProfitPercent: new Decimal(2),
      customDiscountBufferPercent: new Decimal(3), customInstallmentMarkupPercent: null,
      customDownPaymentPercent: null, customInstallmentMonths: null,
      customCalculationMode: PricingCalculationMode.SIMPLE,
    } as never, null);
    expect(result).toMatchObject({ pricingAvailable: true, cashPrice: '318.00' });
  });
});
