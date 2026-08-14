import type { StockMovement } from '../../types/inventory.types';

export interface ReceivingActor { id: string; fullName: string; username: string }
export interface ReceivingSupplier { id: string; name: string; isActive: boolean }
export interface ReceivingProduct { id: string; sku: string; name: string; stockQuantity: number }

export interface SupplierReceivingItem {
  id: string;
  receivingId: string;
  productId: string;
  quantity: number;
  stockMovementId: string;
  createdAt: string;
  product: ReceivingProduct;
  stockMovement: StockMovement;
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
  items?: SupplierReceivingItem[];
  _count?: { items: number };
}

export interface CreateSupplierReceivingInput {
  supplierId?: string | null;
  referenceNumber?: string | null;
  note?: string | null;
  receivedOn?: string;
  items: Array<{ productId: string; quantity: number }>;
}

export interface SupplierReceivingFilters { page?: number; pageSize?: number; supplierId?: string; referenceNumber?: string }
export interface ReceivingPagination { page: number; pageSize: number; totalItems: number; totalPages: number }
export interface DuplicateReceivingResult { duplicate: boolean; match: SupplierReceiving | null }
