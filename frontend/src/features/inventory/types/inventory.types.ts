import type { Product, ProductActor, ProductStockStatus } from '../../products/types/product.types';

export type StockMovementType =
  | 'OPENING_BALANCE'
  | 'MANUAL_ADD'
  | 'MANUAL_REMOVE'
  | 'STOCK_COUNT'
  | 'DAMAGE_LOSS'
  | 'RETURN_TO_STOCK'
  | 'PURCHASE_RECEIPT'
  | 'PURCHASE_RECEIPT_REVERSAL'
  | 'SALE_FULFILLMENT'
  | 'SALE_CANCEL_RESTORE'
  | 'SERVICE_PART_USED';

export type WiredStockMovementType = Exclude<StockMovementType,
  'OPENING_BALANCE' | 'PURCHASE_RECEIPT' | 'PURCHASE_RECEIPT_REVERSAL' | 'SALE_FULFILLMENT' | 'SALE_CANCEL_RESTORE' | 'SERVICE_PART_USED'>;

export interface StockMovement {
  id: string;
  productId: string;
  movementType: StockMovementType;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  note: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdById: string | null;
  createdBy: (ProductActor & { id: string }) | null;
  createdAt: string;
  product?: Pick<Product, 'id' | 'sku' | 'name' | 'trackStock' | 'stockQuantity'>;
  salesFulfillmentMovement?: { salesOrder: { id: string; orderNumber: string } } | null;
  salesFulfillmentReversalMovement?: { salesOrder: { id: string; orderNumber: string } } | null;
  receivingMetadata?: {
    receivingId: string;
    receivingItemId: string;
    supplierId: string | null;
    supplierName: string | null;
    referenceNumber: string | null;
    receivedOn: string;
    status?: 'POSTED' | 'VOIDED';
  } | null;
}

export interface ProductInventory {
  product: Pick<Product, 'id' | 'sku' | 'name' | 'isActive' | 'trackStock' | 'stockQuantity' | 'lowStockThreshold'> & {
    stockStatus: ProductStockStatus;
  };
  onboardingStatus: 'NOT_IN_INVENTORY' | 'PENDING_ONBOARDING' | 'ONBOARDED';
  recentMovements: StockMovement[];
}

export interface InventorySummary {
  trackedProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  totalUnits: number;
  movementsToday: number;
  ordersAwaitingStockDeduction: number;
  recentMovements: StockMovement[];
}

export interface LowStockProduct {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface PaginationMeta { page: number; pageSize: number; totalItems: number; totalPages: number }

export interface CreateStockMovementInput {
  movementType: WiredStockMovementType;
  quantity: number;
  expectedBefore: number;
  reason: string;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  accountPassword?: string;
}

export interface VerifyOpeningCountInput {
  verifiedCount: number;
  reason: string;
  note?: string | null;
  accountPassword: string;
}

export interface StockMovementResult {
  changed: boolean;
  message: string | null;
  product: ProductInventory['product'];
  movement: StockMovement | null;
}

export interface MovementFilters {
  productId?: string;
  movementType?: StockMovementType;
  createdById?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface InventoryListFilters { search?: string; page?: number; pageSize?: number }
