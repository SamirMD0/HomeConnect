import { describe, expect, it } from 'vitest';
import { isDecimalAtMost, isDecimalGreaterThan } from './decimal-bounds';
import { pricingCalculateSchema } from '../features/pricing/calculator/pricing-calculator.validator';
import { createPricingPresetSchema } from '../features/pricing/presets/pricing-presets.validator';

describe('decimal bound helpers', () => {
  it('compares well-formed decimal strings', () => {
    expect(isDecimalAtMost('99.5', '100')).toBe(true);
    expect(isDecimalAtMost('100', '100')).toBe(true);
    expect(isDecimalAtMost('100.001', '100')).toBe(false);
    expect(isDecimalGreaterThan('0.01', 0)).toBe(true);
    expect(isDecimalGreaterThan('0', 0)).toBe(false);
  });

  it('returns false instead of throwing on unparseable input', () => {
    for (const value of ['', ' ', 'abc', '--1', 'NaN', 'Infinity', '1e', '1.2.3']) {
      expect(() => isDecimalAtMost(value, '100')).not.toThrow();
      expect(() => isDecimalGreaterThan(value, 0)).not.toThrow();
      expect(isDecimalAtMost(value, '100')).toBe(false);
      expect(isDecimalGreaterThan(value, 0)).toBe(false);
    }
  });
});

/**
 * Regression for the 500s in homeconnect-diagnostics-2026-08-06: Zod 4 keeps
 * running checks after one fails, so a refine that built a Decimal from an
 * already-rejected string threw DecimalError straight out of safeParse.
 */
describe('pricing schemas never throw out of safeParse', () => {
  const badValues = ['', ' ', 'abc', '-5', '1.2.3', 'Infinity'];

  it('rejects malformed costPrice without throwing', () => {
    for (const costPrice of badValues) {
      expect(() => pricingCalculateSchema.safeParse({ costPrice })).not.toThrow();
      expect(pricingCalculateSchema.safeParse({ costPrice }).success).toBe(false);
    }
    expect(pricingCalculateSchema.safeParse({ costPrice: '300.00' }).success).toBe(true);
  });

  it('rejects malformed override percentages without throwing', () => {
    for (const value of badValues) {
      const input = {
        costPrice: '300.00',
        overrides: { expensePercent: value },
      };
      expect(() => pricingCalculateSchema.safeParse(input)).not.toThrow();
      expect(pricingCalculateSchema.safeParse(input).success).toBe(false);
    }
  });

  it('rejects malformed preset percentages without throwing', () => {
    for (const value of badValues) {
      const input = {
        name: 'AC', expensePercent: value, profitPercent: '7', discountBufferPercent: '7',
        installmentMarkupPercent: '20', downPaymentPercent: '40', defaultInstallmentMonths: 3,
        reason: 'Creating a preset',
      };
      expect(() => createPricingPresetSchema.safeParse(input)).not.toThrow();
      expect(createPricingPresetSchema.safeParse(input).success).toBe(false);
    }
  });
});
