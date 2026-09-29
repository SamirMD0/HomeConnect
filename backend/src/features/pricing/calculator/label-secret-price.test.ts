import { PricingCalculationMode, PricingRoundingMode } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { automaticDiscountStages, encodeLabelSecretValue, formatStaffLabelCode, UnsafeDiscountStagesError } from '../domain/internal-price-code';
import { resolveLabelSecretPrice, resolveProductPricing } from './pricing-resolution';

const presetOf = (overrides: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'Retail', productType: null,
  expensePercent: new Decimal(0), profitPercent: new Decimal(0), discountBufferPercent: new Decimal('8.109'),
  installmentMarkupPercent: new Decimal(0), downPaymentPercent: new Decimal(100), defaultInstallmentMonths: 1,
  calculationMode: PricingCalculationMode.SIMPLE, roundingMode: PricingRoundingMode.NEAREST_1,
  isDefault: true, isLabelSecretAllowed: false, isActive: true, notes: null, archivedAt: null, archivedReason: null,
  createdById: 'u', updatedById: null, createdAt: new Date(), updatedAt: new Date(),
  ...overrides,
});

// Public retail preset: $370 cost → $400 selling price.
const retail = presetOf();
// Secret "best price" preset: $370 cost → $380.
const bestPrice = presetOf({ id: '22222222-2222-4222-8222-222222222222', name: 'Best price', discountBufferPercent: new Decimal(0), profitPercent: new Decimal('2.703'), isDefault: false, isLabelSecretAllowed: true });
const minimumPrice = presetOf({ id: '33333333-3333-4333-8333-333333333333', name: 'Minimum', discountBufferPercent: new Decimal(0), profitPercent: new Decimal('1.351'), isDefault: false, isLabelSecretAllowed: true });

const productOf = (overrides: Record<string, unknown> = {}) => ({
  id: 'p', name: 'LG QNED 55', model: '55QNED70A6A', barcode: '6222048413923', brand: 'LG', sku: 'HC-000288',
  costPrice: new Decimal(370), pricingPresetId: retail.id, pricingPreset: retail, useCustomPricing: false, installmentEnabled: false,
  customExpensePercent: null, customProfitPercent: null, customDiscountBufferPercent: null, customInstallmentMarkupPercent: null,
  customDownPaymentPercent: null, customInstallmentMonths: null, customCalculationMode: null,
  ...overrides,
});

const resolve = (product: ReturnType<typeof productOf>, secret: ReturnType<typeof presetOf> | null) => {
  const publicPricing = resolveProductPricing(product as never, null);
  return { publicPricing, secret: resolveLabelSecretPrice(product as never, secret as never, publicPricing) };
};

describe('secret label price', () => {
  it('derives the hidden code from the selected secret preset, not the public price', () => {
    const { publicPricing, secret } = resolve(productOf(), bestPrice);

    expect(publicPricing).toMatchObject({ pricingAvailable: true, cashPrice: '400.00' });
    expect(secret).toEqual({ hiddenPrice: '380.00' });
    const code = encodeLabelSecretValue(new Decimal(400), new Decimal(secret.hiddenPrice!), { mode: 'PRICE', prefix: 'K', suffix: 'Z', offset: new Decimal(0), digitMap: null, decimalPlaces: 0 });
    expect(formatStaffLabelCode('HC-000288', code)).toBe('HC-000288-K380Z');
  });

  it('leaves the public price unchanged whether or not a secret preset is chosen', () => {
    const without = resolve(productOf(), null).publicPricing;
    const withSecret = resolve(productOf(), bestPrice).publicPricing;
    expect(withSecret).toEqual(without);
  });

  it('prints no code and warns when no secret preset is chosen', () => {
    const { secret } = resolve(productOf(), null);
    expect(secret).toEqual({ hiddenPrice: null, warning: 'SECRET_PRESET_NOT_SET' });
  });

  it('recalculates when a different preset is chosen or its percentages change', () => {
    const other = { ...bestPrice, profitPercent: new Decimal(5) };
    expect(resolve(productOf(), other).secret).toEqual({ hiddenPrice: '388.50' });
  });

  it('supports a per-print preset change from hidden 380 to hidden 375 without changing public 400', () => {
    const first = resolve(productOf(), bestPrice);
    const second = resolve(productOf(), minimumPrice);
    expect(first.publicPricing).toMatchObject({ pricingAvailable: true, cashPrice: '400.00' });
    expect(second.publicPricing).toEqual(first.publicPricing);
    expect(first.secret.hiddenPrice).toBe('380.00');
    expect(second.secret.hiddenPrice).toBe('375.00');
  });

  it('recalculates when the product cost changes', () => {
    expect(resolve(productOf({ costPrice: new Decimal(300) }), bestPrice).secret).toEqual({ hiddenPrice: '308.11' });
  });

  it('prints nothing rather than a hidden price above the selling price', () => {
    const tooHigh = { ...bestPrice, profitPercent: new Decimal(20) };
    expect(resolve(productOf(), tooHigh).secret).toEqual({ hiddenPrice: null, candidatePrice: '444.00', warning: 'SECRET_ABOVE_PUBLIC' });
  });

  it('prints no code when the hidden price equals the selling price', () => {
    const noBuffer = { ...retail, profitPercent: new Decimal('8.109'), discountBufferPercent: new Decimal(0), isLabelSecretAllowed: true };
    expect(resolve(productOf(), noBuffer).secret).toEqual({ hiddenPrice: null, candidatePrice: '400.00', warning: 'SECRET_EQUALS_PUBLIC' });
  });

  it('uses the selected preset price before its discount buffer as the hidden source', () => {
    const tv = presetOf({
      expensePercent: new Decimal(10), profitPercent: new Decimal(10), discountBufferPercent: new Decimal(20),
      calculationMode: PricingCalculationMode.COMPOUND, roundingMode: PricingRoundingMode.CEIL_1,
      isLabelSecretAllowed: true,
    });
    const tvProduct = productOf({ costPrice: new Decimal(300), pricingPresetId: tv.id, pricingPreset: tv });

    const { publicPricing, secret } = resolve(tvProduct, tv);

    expect(publicPricing).toMatchObject({ pricingAvailable: true, cashPrice: '436.00', priceWithoutDiscountBuffer: '363.00' });
    expect(secret).toEqual({ hiddenPrice: '363.00' });
    expect(encodeLabelSecretValue(new Decimal(436), new Decimal(secret.hiddenPrice!), {
      mode: 'DISCOUNT_PERCENTAGE', prefix: 'K', suffix: 'Z', offset: new Decimal(0), digitMap: null, decimalPlaces: 1,
    })).toBe('K16.7Z');
  });

  it('prints nothing when the secret preset cannot be calculated', () => {
    const broken = { ...bestPrice, defaultInstallmentMonths: 0 };
    expect(resolve(productOf(), broken).secret).toEqual({ hiddenPrice: null, warning: 'SECRET_PRICE_FAILED' });
  });

  it('prints nothing when the selected preset would place the hidden price below cost', () => {
    const belowCost = presetOf({ expensePercent: new Decimal(0), profitPercent: new Decimal(-1), discountBufferPercent: new Decimal(0), isLabelSecretAllowed: true });
    expect(resolve(productOf({ costPrice: new Decimal('370.49') }), belowCost).secret).toEqual({ hiddenPrice: null, candidatePrice: '366.79', warning: 'SECRET_BELOW_COST' });
  });

  it('prints nothing when the product has no cost or no public price', () => {
    expect(resolve(productOf({ costPrice: null }), bestPrice).secret).toEqual({ hiddenPrice: null, warning: 'SECRET_NO_COST' });
    const noPublicPrice = productOf({ pricingPresetId: null, pricingPreset: null });
    expect(resolve(noPublicPrice, bestPrice).secret).toEqual({ hiddenPrice: null, warning: 'SECRET_PRICE_FAILED' });
  });

  it('supports deterministic price, percentage, offset, and digit-map encodings', () => {
    const common = { prefix: 'K', suffix: 'Z', offset: new Decimal(0), digitMap: null, decimalPlaces: 0 };
    expect(encodeLabelSecretValue(new Decimal(400), new Decimal(380), { ...common, mode: 'PRICE' })).toBe('K380Z');
    expect(encodeLabelSecretValue(new Decimal(400), new Decimal(380), { ...common, mode: 'DISCOUNT_PERCENTAGE', prefix: 'D', suffix: '%' })).toBe('D5%');
    expect(encodeLabelSecretValue(new Decimal(400), new Decimal(380), { ...common, mode: 'OFFSET_PRICE', offset: new Decimal(37) })).toBe('K417Z');
    expect(encodeLabelSecretValue(new Decimal(400), new Decimal(380), { ...common, mode: 'DIGIT_MAP_PRICE', digitMap: 'MARKETPLUS' })).toBe('KKUMZ');
    expect(encodeLabelSecretValue(new Decimal(400), new Decimal(380), { ...common, mode: 'PRICE', prefix: 'X', suffix: 'Q' })).toBe('X380Q');
  });

  it('generates randomized staged discount instructions within the safe maximum', () => {
    const values = [0.99, 0.34, 0, 0, 0, 0, 0];
    const random = () => values.shift() ?? 0;
    expect(automaticDiscountStages(new Decimal(10), random)).toEqual([7, 2, 1]);

    const rule = { mode: 'STAGED_DISCOUNT' as const, prefix: '', suffix: '', offset: new Decimal(0), digitMap: null, decimalPlaces: 0 };
    expect(encodeLabelSecretValue(new Decimal(100), new Decimal(90), rule, { discountStages: [3, 2, 1], random: () => 0 })).toBe('3A2B1CD');
    expect(encodeLabelSecretValue(new Decimal(100), new Decimal(90), rule, { discountStages: [3, 2, 1], random: () => 0.99 })).not.toBe('3A2B1CD');
  });

  it('rejects manual stages whose total exceeds the calculated safe discount', () => {
    const rule = { mode: 'STAGED_DISCOUNT' as const, prefix: '', suffix: '', offset: new Decimal(0), digitMap: null, decimalPlaces: 0 };
    expect(() => encodeLabelSecretValue(new Decimal(100), new Decimal(95), rule, { discountStages: [3, 2, 1] }))
      .toThrow(UnsafeDiscountStagesError);
    expect(encodeLabelSecretValue(new Decimal(100), new Decimal(95), rule, { discountStages: [3, 2], random: () => 0 })).toBe('3A2BC');
  });
});
