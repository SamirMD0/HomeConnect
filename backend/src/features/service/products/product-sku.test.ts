import { describe, expect, it } from 'vitest';
import { formatProductSku, PRODUCT_SKU_PATTERN } from './product-sku';

describe('product SKU', () => {
  it('formats a stable scanner-safe sequence', () => {
    expect(formatProductSku(124)).toBe('HC-000124');
    expect(formatProductSku(1_000_000)).toBe('HC-1000000');
    expect(PRODUCT_SKU_PATTERN.test('HC-000124')).toBe(true);
  });
});
