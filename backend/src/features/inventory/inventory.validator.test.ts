import { describe, expect, it } from 'vitest';
import {
  assertExpectedBefore,
  assertMovementQuantity,
  assertStockCountTarget,
  inventoryProductParamsSchema,
  normalizeRequiredReason,
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
});
