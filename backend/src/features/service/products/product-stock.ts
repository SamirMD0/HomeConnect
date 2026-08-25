export type ProductStockStatus = 'NOT_TRACKED' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

export function deriveProductStockStatus(input: {
  trackStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number | null;
}): ProductStockStatus {
  if (!input.trackStock) return 'NOT_TRACKED';
  if (input.stockQuantity === 0) return 'OUT_OF_STOCK';
  if (input.lowStockThreshold != null && input.stockQuantity <= input.lowStockThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

/**
 * The catalogue's stock filter. The first four mirror `deriveProductStockStatus`
 * one-for-one, so filtering by a value always returns exactly the rows whose
 * badge shows it. `NOT_IN_INVENTORY` is the extra case the badge cannot express:
 * a product that was never brought into inventory at all.
 */
export const PRODUCT_STOCK_FILTERS = [
  'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'NOT_TRACKED', 'NOT_IN_INVENTORY',
] as const;

export type ProductStockFilter = (typeof PRODUCT_STOCK_FILTERS)[number];

/**
 * "Never entered inventory" — no stock movement has ever been written for it,
 * tracking was never switched on, and it holds no quantity.
 *
 * Deliberately the same predicate `InventoryService.getProductInventory` uses to
 * report `NOT_IN_INVENTORY`, so the catalogue chip and the drawer cannot disagree.
 * A product with movements but no opening balance is `PENDING_ONBOARDING`, which
 * belongs to the onboarding worklist rather than the catalogue.
 */
export function isProductOutsideInventory(input: {
  trackStock: boolean;
  stockQuantity: number;
  movementCount: number;
}): boolean {
  return input.movementCount === 0 && !input.trackStock && input.stockQuantity === 0;
}
