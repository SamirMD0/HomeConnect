import { describe, expect, it } from 'vitest';
import {
  MAX_PRODUCT_FEATURES,
  normalizeProductPricingCardFeatures,
} from './product-pricing-card-features';

describe('normalizeProductPricingCardFeatures', () => {
  it('sorts, trims, deduplicates icon codes, drops empty rows, and resequences positions', () => {
    expect(normalizeProductPricingCardFeatures([
      { iconCode: ' spin-speed ', label: ' Spin ', value: ' 1200 rpm ', position: 8 },
      { iconCode: 'capacity', label: '', value: ' 9 kg ', position: 2 },
      { iconCode: 'SPIN-SPEED', label: 'duplicate', value: null, position: 3 },
      { iconCode: '   ', label: 'empty', value: 'ignored', position: 1 },
      { iconCode: 'energy-rating', label: null, value: '', position: 2 },
    ])).toEqual([
      { iconCode: 'capacity', label: null, value: '9 kg', position: 1 },
      { iconCode: 'energy-rating', label: null, value: null, position: 2 },
      { iconCode: 'spin-speed', label: 'Spin', value: '1200 rpm', position: 3 },
    ]);
  });

  it('rejects more than eight normalized highlights', () => {
    expect(MAX_PRODUCT_FEATURES).toBe(8);
    expect(() => normalizeProductPricingCardFeatures(Array.from({ length: 9 }, (_, index) => ({
      iconCode: `feature-${index}`,
      position: index + 1,
    })))).toThrow('at most 8');
  });
});
