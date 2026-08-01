import { describe, expect, it } from 'vitest';
import { createPricingPresetSchema, updatePricingPresetSchema } from './pricing-presets.validator';

const valid = {
  name: 'AC', expensePercent: '10', profitPercent: '7', discountBufferPercent: '7',
  installmentMarkupPercent: '20', downPaymentPercent: '40', defaultInstallmentMonths: 3,
  reason: 'Initial pricing formula', accountPassword: 'secret',
};

describe('pricing preset validation', () => {
  it('keeps percentages as strings and normalizes optional text', () => {
    expect(createPricingPresetSchema.parse({ ...valid, productType: ' ' })).toMatchObject({ expensePercent: '10', productType: null });
  });

  it('rejects invalid ranges and months', () => {
    expect(() => createPricingPresetSchema.parse({ ...valid, downPaymentPercent: '100.001' })).toThrow();
    expect(() => createPricingPresetSchema.parse({ ...valid, defaultInstallmentMonths: 0 })).toThrow();
  });

  it('requires a password only when an update changes formula fields', () => {
    expect(updatePricingPresetSchema.parse({ name: 'AC Premium', reason: 'Rename the formula' })).toBeTruthy();
    expect(() => updatePricingPresetSchema.parse({ profitPercent: '8', reason: 'Change margin' })).toThrow('password');
  });
});
