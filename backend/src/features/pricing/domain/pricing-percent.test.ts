import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { parsePricingPercent, percentFactor, percentToApiString } from './pricing-percent';

describe('pricing percentages', () => {
  it('parses exact string percentages without float conversion', () => {
    const value = parsePricingPercent('7.125');
    expect(percentToApiString(value)).toBe('7.125');
    expect(percentFactor(value).toString()).toBe('1.07125');
  });

  it('enforces precision and field-specific maximums', () => {
    expect(() => parsePricingPercent('1.0001')).toThrow();
    expect(() => parsePricingPercent('-1')).toThrow();
    expect(() => parsePricingPercent('100.001', new Decimal(100))).toThrow();
  });
});
