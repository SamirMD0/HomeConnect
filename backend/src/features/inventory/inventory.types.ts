import { Role, StockMovementType } from '@prisma/client';

export const INVENTORY_QUANTITY_LIMIT = 100_000;

export const ACTIVE_STOCK_MOVEMENT_TYPES = [
  StockMovementType.OPENING_BALANCE,
  StockMovementType.MANUAL_ADD,
  StockMovementType.MANUAL_REMOVE,
  StockMovementType.STOCK_COUNT,
  StockMovementType.DAMAGE_LOSS,
  StockMovementType.RETURN_TO_STOCK,
] as const;

export const RESERVED_STOCK_MOVEMENT_TYPES = [
  StockMovementType.PURCHASE_RECEIPT,
  StockMovementType.SALE_FULFILLMENT,
  StockMovementType.SALE_CANCEL_RESTORE,
  StockMovementType.SERVICE_PART_USED,
] as const;

export interface InventoryUser {
  userId: string;
  role: Role | string;
}

export interface InventoryRequestContext {
  requestId?: string | null;
  ipAddress?: string | null;
}

export interface StockMovementBaseInput {
  quantity: number;
  expectedBefore?: number;
  reason: string;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
}

export interface GuardedStockMovementInput extends StockMovementBaseInput {
  accountPassword: string;
}

export interface StockCountInput extends Omit<GuardedStockMovementInput, 'quantity'> {
  targetTotal: number;
}

export interface VerifyOpeningCountInput {
  verifiedCount: number;
  reason: string;
  note?: string | null;
  accountPassword: string;
}

export interface MovementListInput {
  productId?: string;
  movementType?: StockMovementType;
  createdById?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export interface LowStockListInput {
  search?: string;
  page?: number;
  pageSize?: number;
}

export type StockIntegrityStatus = 'NOT_IN_INVENTORY' | 'PENDING_ONBOARDING' | 'OK' | 'MISMATCH';

export interface StockIntegrityItem {
  productId: string;
  sku: string;
  name: string;
  trackStock: boolean;
  stockQuantity: number;
  ledgerSum: number;
  movementCount: number;
  hasOpeningBalance: boolean;
  lastQuantityAfter: number | null;
  status: StockIntegrityStatus;
}

export interface StockIntegrityResult {
  available: true;
  checkedAt: string;
  totalProducts: number;
  ok: number;
  notInInventory: number;
  pendingOnboarding: number;
  mismatch: number;
  items: StockIntegrityItem[];
}

export interface StockIntegrityUnavailable {
  available: false;
  checkedAt: string;
  message: string;
}

export type MaintenanceStockIntegrity = StockIntegrityResult | StockIntegrityUnavailable;
