import type { StockMovement } from '../../types/inventory.types';

export interface ReceivingActor { id: string; fullName: string; username: string }
export interface ReceivingSupplier { id: string; name: string; isActive: boolean }
export interface ReceivingProduct { id: string; sku: string; name: string; stockQuantity: number }

export type SupplierReceivingStatus = 'POSTED' | 'VOIDED';
export type SupplierReceivingItemStatus = 'ACTIVE' | 'REVERSED';
export type SupplierReceivingAuditAction = 'UPDATE_METADATA' | 'VOID';

export interface SupplierReceivingItem {
  id: string;
  receivingId: string;
  productId: string;
  quantity: number;
  stockMovementId: string;
  createdAt: string;
  product: ReceivingProduct;
  stockMovement: StockMovement;
  status?: SupplierReceivingItemStatus;
  /** The compensating movement that gave this quantity back; present only once voided. */
  reversalStockMovementId?: string | null;
  reversalStockMovement?: StockMovement | null;
  reversedAt?: string | null;
  reversedBy?: ReceivingActor | null;
  reversalReason?: string | null;
}

export interface SupplierReceivingAuditEntry {
  id: string;
  action: SupplierReceivingAuditAction;
  changedByName: string;
  changedByUsername: string;
  changedAt: string;
  reason: string;
}

export interface SupplierReceiving {
  id: string;
  supplierId: string | null;
  supplier: ReceivingSupplier | null;
  referenceNumber: string | null;
  note: string | null;
  receivedOn: string;
  receivedById: string;
  receivedBy: ReceivingActor;
  createdAt: string;
  status?: SupplierReceivingStatus;
  voidedAt?: string | null;
  voidedBy?: ReceivingActor | null;
  voidReason?: string | null;
  items?: SupplierReceivingItem[];
  audits?: SupplierReceivingAuditEntry[];
  _count?: { items: number; transactions?: number };
  transactions?: Array<{ id: string; type: 'SUPPLIER_DEBT'; status: 'ACTIVE'|'REMOVED'; amount: string }>;
}

export interface CreateSupplierReceivingInput {
  supplierId?: string | null;
  referenceNumber?: string | null;
  note?: string | null;
  receivedOn?: string;
  items: Array<{ productId: string; quantity: number }>;
}

/** Reference and note only. Quantity, product, and date are history — correcting those is a void plus a new receiving. */
export interface UpdateReceivingMetadataInput {
  referenceNumber?: string | null;
  note?: string | null;
  reason: string;
}
export interface VoidReceivingInput { reason: string; accountPassword: string }

export interface SupplierReceivingFilters { page?: number; pageSize?: number; supplierId?: string; referenceNumber?: string }
export interface ReceivingPagination { page: number; pageSize: number; totalItems: number; totalPages: number }
export interface DuplicateReceivingResult { duplicate: boolean; match: SupplierReceiving | null }
