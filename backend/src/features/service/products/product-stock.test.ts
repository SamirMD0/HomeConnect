import { describe, expect, it } from 'vitest';
import { deriveProductStockStatus, isProductOutsideInventory, PRODUCT_STOCK_FILTERS } from './product-stock';

describe('product stock status', () => {
  it.each([
    [{ trackStock: false, stockQuantity: 0, lowStockThreshold: null }, 'NOT_TRACKED'],
    [{ trackStock: true, stockQuantity: 0, lowStockThreshold: 2 }, 'OUT_OF_STOCK'],
    [{ trackStock: true, stockQuantity: 2, lowStockThreshold: 2 }, 'LOW_STOCK'],
    [{ trackStock: true, stockQuantity: 3, lowStockThreshold: 2 }, 'IN_STOCK'],
  ] as const)('derives %s', (input, expected) => expect(deriveProductStockStatus(input)).toBe(expected));

  it('offers a filter for every badge it can derive, plus the never-onboarded case', () => {
    expect(PRODUCT_STOCK_FILTERS).toEqual(
      expect.arrayContaining(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'NOT_TRACKED', 'NOT_IN_INVENTORY'])
    );
    expect(PRODUCT_STOCK_FILTERS).toHaveLength(5);
  });
});

describe('products outside inventory', () => {
  it('matches only a product with no movements, no tracking, and no quantity', () => {
    expect(isProductOutsideInventory({ trackStock: false, stockQuantity: 0, movementCount: 0 })).toBe(true);
  });

  it.each([
    ['it has been counted before', { trackStock: false, stockQuantity: 0, movementCount: 1 }],
    ['tracking is switched on', { trackStock: true, stockQuantity: 0, movementCount: 0 }],
    ['it holds a quantity', { trackStock: false, stockQuantity: 3, movementCount: 0 }],
  ])('is false when %s', (_reason, input) => expect(isProductOutsideInventory(input)).toBe(false));
});
