export type SalesChannel = 'SHOP_DIRECT' | 'SHOP_DELIVERY' | 'PHONE_ORDER';
export type SalesOrderFulfillmentStatus = 'DRAFT' | 'CONFIRMED' | 'PREPARING' | 'READY_FOR_DELIVERY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
export type SalesOrderPaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
export type SalesOrderSettlement = 'NONE' | 'DEBT' | 'INSTALLMENT';

export interface SalesOrderCustomer { id: string; name: string; phone: string; address: string | null; isActive: boolean }
export interface SalesOrderActor { id: string; fullName: string; username: string }
export interface SalesOrderProduct {
  id: string; name: string; model: string; sku: string; barcode: string | null; isActive: boolean;
  trackStock: boolean; stockQuantity: number; lowStockThreshold: number | null; costPrice: string | null;
}
export type SalesOrderInventoryState =
  | 'NOT_INVENTORY_LINE'
  | 'STOCK_NOT_TRACKED'
  | 'NEEDS_OPENING_COUNT'
  | 'PREDATES_OPENING_COUNT'
  | 'ORDER_NOT_ELIGIBLE'
  | 'INSUFFICIENT_STOCK'
  | 'ALREADY_DEDUCTED'
  | 'RESTORED'
  | 'AVAILABLE';
export interface SalesOrderStockFulfillment {
  id: string; quantity: number; status: 'ACTIVE' | 'REVERSED'; stockMovementId: string;
  reversalStockMovementId: string | null; reversedAt: string | null; reversedById: string | null;
  reversalReason: string | null; createdById: string; createdAt: string;
}
export interface SalesOrderItem {
  id: string; salesOrderId: string; productId: string | null; product: SalesOrderProduct | null;
  manualProductName: string | null; manualProductModel: string | null;
  productNameSnapshot: string; productModelSnapshot: string | null; skuSnapshot: string | null;
  quantity: number; unitPrice: string;
  // Reserved for a future per-line discount; the current UI always submits zero.
  discountAmount: string; lineTotal: string; notes: string | null;
  createdAt: string; updatedAt: string;
  stockFulfillments: SalesOrderStockFulfillment[];
  inventory: { state: SalesOrderInventoryState; activeFulfillmentId: string | null };
}
export interface SalesOrder {
  id: string; orderNumber: string; customerId: string | null; customer: SalesOrderCustomer | null;
  salesChannel: SalesChannel; orderDate: string; deliveryDate: string | null; deliveredAt: string | null;
  fulfillmentStatus: SalesOrderFulfillmentStatus; paymentStatus: SalesOrderPaymentStatus; settlement: SalesOrderSettlement;
  itemsSubtotal: string; deliveryFee: string; totalAmount: string; paidAmount: string; remainingAmount: string;
  deliveryAddressSnapshot: string | null; deliveryNotes: string | null; notes: string | null;
  debtId: string | null; debt: { id: string; status: string; originalAmount: string; dueDate: string } | null;
  installmentPlanId: string | null; installmentPlan: { id: string; status: string; totalAmount: string; startDate: string } | null;
  createdBy: SalesOrderActor; updatedBy: SalesOrderActor | null; createdAt: string; updatedAt: string;
  cancelledAt: string | null; cancelledReason: string | null; items: SalesOrderItem[];
}
export interface SalesAudit {
  id: string; action: string; changedByName: string; changedByUsername: string; changedAt: string;
  reason: string; beforeValues: Record<string, unknown>; afterValues: Record<string, unknown>;
}
export interface SalesOrderSummary {
  /** Scoped to the date range the page is showing. */
  periodSales: string; periodOrders: number;
  /** Backlog counts, always global — an old unpaid order still matters today. */
  pendingDelivery: number; unpaidOrders: number; partialPayments: number;
}
export interface SalesOrderPagination { page: number; pageSize: number; totalItems: number; totalPages: number }
export interface SalesOrderFilters {
  search?: string; customerId?: string; salesChannel?: SalesChannel[]; fulfillmentStatus?: SalesOrderFulfillmentStatus[];
  paymentStatus?: SalesOrderPaymentStatus[]; settlement?: SalesOrderSettlement[]; dateFrom?: string; dateTo?: string;
  sort?: 'createdDesc' | 'createdAsc' | 'customerAsc' | 'totalDesc'; page?: number; pageSize?: number;
  awaitingStockDeduction?: boolean;
}
export interface DeductSalesOrderStockInput { itemIds: string[]; note?: string | null }
export interface RestoreSalesOrderStockInput { fulfillmentIds: string[]; reason: string; note?: string | null }
export interface SalesOrderStockActionResult {
  message: string;
  fulfillments: Array<{
    fulfillmentId: string; itemId: string; productId: string; quantity: number;
    quantityBefore: number; quantityAfter: number; movementId?: string;
    originalMovementId?: string; reversalMovementId?: string;
  }>;
}
export interface SalesOrderLineInput {
  productId?: string | null; manualProductName?: string | null; manualProductModel?: string | null;
  quantity: number; unitPrice: string; discountAmount?: string | null; notes?: string | null;
}
export interface CreateSalesOrderInput {
  customerId?: string | null; salesChannel: SalesChannel; orderDate: string;
  fulfillmentStatus?: 'DRAFT' | 'CONFIRMED' | 'DELIVERED'; deliveryDate?: string | null;
  deliveryFee?: string | null; paidAmount: string; debtDueDate?: string | null;
  deliveryAddressSnapshot?: string | null; deliveryNotes?: string | null; notes?: string | null;
  items: SalesOrderLineInput[];
}
export type UpdateSalesOrderInput = Partial<Omit<CreateSalesOrderInput, 'items' | 'paidAmount' | 'fulfillmentStatus'>> & { reason?: string; accountPassword?: string };
