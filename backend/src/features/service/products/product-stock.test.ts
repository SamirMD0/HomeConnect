import { describe, expect, it } from 'vitest';
import { deriveProductStockStatus } from './product-stock';

describe('product stock status', () => {
  it.each([
    [{ trackStock: false, stockQuantity: 0, lowStockThreshold: null }, 'NOT_TRACKED'],
    [{ trackStock: true, stockQuantity: 0, lowStockThreshold: 2 }, 'OUT_OF_STOCK'],
    [{ trackStock: true, stockQuantity: 2, lowStockThreshold: 2 }, 'LOW_STOCK'],
    [{ trackStock: true, stockQuantity: 3, lowStockThreshold: 2 }, 'IN_STOCK'],
  ] as const)('derives %s', (input, expected) => expect(deriveProductStockStatus(input)).toBe(expected));
});
