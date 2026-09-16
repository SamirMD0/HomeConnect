export type SalesChannel = 'SHOP_DIRECT' | 'SHOP_DELIVERY' | 'PHONE_ORDER';
export type SalesOrderFulfillmentStatus = 'DRAFT' | 'CONFIRMED' | 'PREPARING' | 'READY_FOR_DELIVERY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'PARTIALLY_RETURNED' | 'CANCELLED' | 'RETURNED';
export type SalesOrderPaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
export type SalesOrderSettlement = 'NONE' | 'DEBT' | 'INSTALLMENT';
export type Currency = 'USD' | 'LBP';
export type DeliveryTaxTreatment = 'STANDARD' | 'ZERO_RATED' | 'EXEMPT';
export type SalesReturnStockDisposition = 'SELLABLE' | 'DAMAGED' | 'QUARANTINE';
export type SalesReturnRefundMethod = 'NONE' | 'CASH_OUT' | 'STORE_CREDIT';

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
  discountAmount: string; lineTotal: string; taxRateSnapshot: string; taxCodeSnapshot: string | null;
  unitPriceExVat: string; vatAmount: string; lineTotalIncVat: string; notes: string | null;
  createdAt: string; updatedAt: string;
  stockFulfillments: SalesOrderStockFulfillment[];
  returnedQuantity?: number; remainingReturnableQuantity?: number;
  inventory: { state: SalesOrderInventoryState; activeFulfillmentId: string | null };
}
export interface SalesOrder {
  id: string; orderNumber: string; customerId: string | null; customer: SalesOrderCustomer | null;
  salesChannel: SalesChannel; orderDate: string; deliveryDate: string | null; deliveredAt: string | null;
  fulfillmentStatus: SalesOrderFulfillmentStatus; paymentStatus: SalesOrderPaymentStatus; settlement: SalesOrderSettlement;
  counterPayments?: Array<{ id: string; voidedAt: string | null }>;
  currency: Currency; exchangeRate: string;
  itemsSubtotal: string; itemsVatAmount: string; subtotalExVat: string;
  deliveryFee: string; deliveryTaxTreatment: DeliveryTaxTreatment; deliveryTaxRateSnapshot: string;
  deliveryTaxCodeSnapshot: string | null; deliveryFeeExVat: string; deliveryVatAmount: string; deliveryFeeIncVat: string;
  vatAmount: string; totalAmount: string; paidAmount: string; remainingAmount: string;
  baseSubtotal: string; baseDeliveryFee: string; baseTotalAmount: string; basePaidAmount: string; baseRemainingAmount: string;
  deliveryAddressSnapshot: string | null; deliveryNotes: string | null; notes: string | null;
  debtId: string | null; debt: { id: string; status: string; originalAmount: string; dueDate: string } | null;
  installmentPlanId: string | null; installmentPlan: { id: string; status: string; totalAmount: string; startDate: string } | null;
  createdBy: SalesOrderActor; updatedBy: SalesOrderActor | null; createdAt: string; updatedAt: string;
  cancelledAt: string | null; cancelledReason: string | null; items: SalesOrderItem[];
  returns?: Array<{ id: string; returnNumber: string; returnDate: string; totalIncVat: string; refundMethod: SalesReturnRefundMethod; deliveryReturned: boolean; documentRoute: string }>;
}
export interface SalesAudit {
  id: string; action: string; changedByName: string; changedByUsername: string; changedAt: string;
  reason: string; beforeValues: Record<string, unknown>; afterValues: Record<string, unknown>;
}
export interface SalesOrderSummary {
  /** Scoped to the date range the page is showing. */
  periodSales: string; periodOrders: number;
  periodGrossSales?: string; periodReturns?: string; periodNetSales?: string;
  /** Backlog counts, always global — an old unpaid order still matters today. */
  pendingDelivery: number; unpaidOrders: number; partialPayments: number;
}
export interface ReturnSalesOrderInput {
  idempotencyKey: string;
  items: Array<{ salesOrderItemId: string; quantity: number; stockDisposition: SalesReturnStockDisposition; conditionNote?: string | null }>;
  returnDeliveryFee: boolean;
  refundMethod: SalesReturnRefundMethod;
  reason: string;
  overrideReturnWindow: boolean;
  windowOverrideReason?: string | null;
  accountPassword: string;
}

export interface SalesReturn {
  id: string; returnNumber: string; salesOrderId: string; customerId: string | null;
  salesOrder: { id: string; orderNumber: string; orderDate: string };
  customer: { id: string; name: string; phone: string; address: string | null } | null;
  returnDate: string; processedAt: string; reason: string; currency: Currency; exchangeRate: string;
  subtotalExVat: string; vatAmount: string; totalIncVat: string;
  receivableReliefAmount: string; refundableAmount: string; refundMethod: SalesReturnRefundMethod;
  deliveryReturned: boolean; deliveryTaxTreatment: DeliveryTaxTreatment | null; deliveryTaxRateSnapshot: string | null;
  deliveryFeeExVat: string | null; deliveryVatAmount: string | null; deliveryFeeIncVat: string | null;
  processedByName: string; processedByUsername: string; documentRoute: string;
  items: Array<{ id: string; productNameSnapshot: string; productModelSnapshot: string | null; skuSnapshot: string | null; quantity: number; unitPriceSnapshot: string; discountAmount: string; subtotalExVat: string; vatAmount: string; totalIncVat: string; taxRateSnapshot: string; taxCodeSnapshot: string | null; stockDisposition: SalesReturnStockDisposition; conditionNote: string | null }>;
  cashRefund: { id: string; amount: string } | null;
  customerCredit: { id: string; issuedAmount: string } | null;
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
  idempotencyKey?: string;
  currency?: 'USD' | 'LBP';
  exchangeRate?: string;
  customerId?: string | null; salesChannel: SalesChannel; orderDate: string;
  fulfillmentStatus?: 'DRAFT' | 'CONFIRMED' | 'DELIVERED'; deliveryDate?: string | null;
  deliveryFee?: string | null; deliveryTaxTreatment?: DeliveryTaxTreatment; deliveryTaxProfileId?: string | null;
  paidAmount: string; debtDueDate?: string | null;
  deliveryAddressSnapshot?: string | null; deliveryNotes?: string | null; notes?: string | null;
  items: SalesOrderLineInput[];
}
export type UpdateSalesOrderInput = Partial<Omit<CreateSalesOrderInput, 'items' | 'paidAmount' | 'fulfillmentStatus'>> & { reason?: string; accountPassword?: string };
