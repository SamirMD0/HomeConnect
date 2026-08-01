import { describe, expect, it } from 'vitest';
import { assertPricingAdmin, containsSensitivePricingPresetFields } from './pricing-policy';

describe('pricing preset policy', () => {
  it('distinguishes formula fields from descriptive fields', () => {
    expect(containsSensitivePricingPresetFields(['name', 'notes'])).toBe(false);
    expect(containsSensitivePricingPresetFields(['profitPercent'])).toBe(true);
  });

  it('allows only administrators to mutate pricing', () => {
    expect(() => assertPricingAdmin({ role: 'ADMIN' })).not.toThrow();
    expect(() => assertPricingAdmin({ role: 'EMPLOYEE' })).toThrow();
  });
});
