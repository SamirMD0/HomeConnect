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
