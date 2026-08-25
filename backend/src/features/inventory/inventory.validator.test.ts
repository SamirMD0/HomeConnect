import { describe, expect, it } from 'vitest';
import {
  assertExpectedBefore,
  assertMovementQuantity,
  assertStockCountTarget,
  batchVerifyOpeningCountSchema,
  inventoryProductParamsSchema,
  normalizeRequiredReason,
  onboardingWorklistSchema,
} from './inventory.validator';

describe('inventory validation', () => {
  it('accepts positive whole movement quantities and a zero stock-count target', () => {
    expect(() => assertMovementQuantity(1)).not.toThrow();
    expect(() => assertStockCountTarget(0)).not.toThrow();
    expect(() => assertExpectedBefore(0)).not.toThrow();
  });

  it('rejects zero for ordinary movements, negatives, fractions, and typo-sized inputs', () => {
    for (const value of [0, -1, 1.25, 1_000_000]) expect(() => assertMovementQuantity(value)).toThrow();
    for (const value of [-1, 1.25, 1_000_000]) expect(() => assertStockCountTarget(value)).toThrow();
  });

  it('trims a reason and rejects a blank one', () => {
    expect(normalizeRequiredReason('  shelf count  ')).toBe('shelf count');
    expect(() => normalizeRequiredReason('  ')).toThrow('Reason is required');
  });

  it('accepts canonical legacy PostgreSQL product UUIDs and rejects malformed IDs', () => {
    expect(inventoryProductParamsSchema.parse({
      productId: '02880843-6f16-93fb-2ecc-091af51a07b4',
    })).toEqual({ productId: '02880843-6f16-93fb-2ecc-091af51a07b4' });
    expect(() => inventoryProductParamsSchema.parse({ productId: 'not-a-uuid' })).toThrow('Invalid ID');
  });

  it('parses onboarding worklist defaults and caps pages at 100', () => {
    expect(onboardingWorklistSchema.parse({})).toEqual({ includeArchived: false, page: 1, pageSize: 50 });
    expect(onboardingWorklistSchema.parse({ search: ' Fan ', includeArchived: 'true', page: '2', pageSize: '100' }))
      .toEqual({ search: 'Fan', includeArchived: true, page: 2, pageSize: 100 });
    expect(() => onboardingWorklistSchema.parse({ pageSize: '101' })).toThrow();
  });

  it('accepts zero opening counts and rejects every malformed batch boundary', () => {
    const productId = '11111111-1111-4111-8111-111111111111';
    const valid = { items: [{ productId, openingCount: 0 }] };
    expect(batchVerifyOpeningCountSchema.parse(valid)).toMatchObject(valid);
    for (const input of [
      { ...valid, items: [] },
      { ...valid, items: Array.from({ length: 101 }, (_, index) => ({ productId: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`, openingCount: 0 })) },
      { ...valid, items: [...valid.items, ...valid.items] },
      { ...valid, items: [{ productId, openingCount: -1 }] },
      { ...valid, items: [{ productId, openingCount: 1.5 }] },
      { ...valid, items: [{ productId, openingCount: 100_001 }] },
      { ...valid, unexpected: true },
      { ...valid, reason: 'Client-supplied reason is not part of this contract' },
      { ...valid, accountPassword: 'secret' },
      { ...valid, items: [{ productId, openingCount: 0, unexpected: true }] },
    ]) expect(() => batchVerifyOpeningCountSchema.parse(input)).toThrow();
  });
});
