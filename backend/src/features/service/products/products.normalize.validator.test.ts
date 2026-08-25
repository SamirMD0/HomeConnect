import { describe, expect, it } from 'vitest';
import { normalizeProductBrandsSchema } from './products.validator';

const valid = { sourceBrands: ['General', 'GENERAL'], targetBrand: 'General', reason: 'Normalize duplicate spelling' };

describe('product brand normalization validation', () => {
  it('accepts one strict payload and defaults to a write', () => {
    expect(normalizeProductBrandsSchema.parse(valid)).toEqual({ ...valid, dryRun: false });
    expect(normalizeProductBrandsSchema.safeParse({ ...valid, accountPassword: 'not-accepted' }).success).toBe(false);
  });

  it.each([
    { ...valid, sourceBrands: [] },
    { ...valid, sourceBrands: Array.from({ length: 21 }, (_, index) => `Brand ${index}`) },
    { ...valid, sourceBrands: [null] },
    { ...valid, sourceBrands: [''] },
  ])('rejects invalid source brand arrays', (input) => {
    expect(normalizeProductBrandsSchema.safeParse(input).success).toBe(false);
  });
});
