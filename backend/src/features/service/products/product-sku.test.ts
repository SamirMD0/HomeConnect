import { describe, expect, it } from 'vitest';
import { generateProductSku, formatProductSku, PRODUCT_SKU_PATTERN } from './product-sku';

describe('product SKU', () => {
  it('formats a stable scanner-safe sequence', () => {
    expect(formatProductSku(124)).toBe('HC-000124');
    expect(formatProductSku(1_000_000)).toBe('HC-1000000');
    expect(PRODUCT_SKU_PATTERN.test('HC-000124')).toBe(true);
  });
  it('uses distinct atomic sequence values for concurrent requests', async () => {
    let value = 0n;
    const tx = { $queryRaw: async () => [{ value: ++value }] } as never;
    const results = await Promise.all([generateProductSku(tx), generateProductSku(tx), generateProductSku(tx)]);
    expect(new Set(results).size).toBe(3);
    expect(results).toEqual(['HC-000001', 'HC-000002', 'HC-000003']);
  });
});
