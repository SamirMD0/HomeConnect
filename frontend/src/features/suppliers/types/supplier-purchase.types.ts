import type { PaginationMeta, SupplierActor, SupplierTransaction } from './supplier.types';

/** How a line is entered in the form. NEW_PRODUCT resolves to a PRODUCT line on the server. */
export type PurchaseLineMode = 'EXISTING_PRODUCT' | 'NEW_PRODUCT' | 'MANUAL';
/** How a line is stored: money-only, or tied to a real product. */
export type SupplierPurchaseLineKind = 'PRODUCT' | 'MANUAL';

export interface ExistingProductLineInput {
  kind: 'EXISTING_PRODUCT';
  productId: string;
  quantity: number;
  unitPrice: string;
}
export interface NewProductLineInput {
  kind: 'NEW_PRODUCT';
  name: string;
  model: string;
  barcode?: string | null;
  brand?: string | null;
  sellingPrice?: string | null;
  quantity: number;
  unitPrice: string;
}
export interface ManualLineInput {
  kind: 'MANUAL';
  description: string;
  amount: string;
}
export type SupplierPurchaseLineInput = ExistingProductLineInput | NewProductLineInput | ManualLineInput;

export interface CreateSupplierPurchaseInput {
  receiptNumber?: string | null;
  transactionDate: string;
  description: string;
  reference?: string | null;
  notes?: string | null;
  receiveStock: boolean;
  amountOverride?: string | null;
  amountOverrideReason?: string | null;
  /** Settled on the spot. Posted as a separate payment, never as a smaller debt. */
  paidAmount?: string | null;
  paymentReference?: string | null;
  accountPassword?: string;
  lines: SupplierPurchaseLineInput[];
}

/** What the shop actually owes after this bill. */
export type PurchasePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface SupplierPurchaseLine {
  id: string;
  kind: SupplierPurchaseLineKind;
  productId: string | null;
  description: string;
  quantity: number | null;
  unitPrice: string | null;
  lineTotal: string;
  receivingItemId: string | null;
  position: number;
  product?: { id: string; sku: string; name: string; model: string; trackStock: boolean; stockQuantity: number } | null;
  receivingItem?: { id: string; receivingId: string; quantity: number; stockMovementId: string } | null;
}

export interface SupplierPurchase extends Pick<SupplierTransaction,
  'id' | 'supplierId' | 'type' | 'direction' | 'amount' | 'transactionDate' | 'description' | 'reference' | 'notes' | 'status'
> {
  receiptNumber: string | null;
  /** Sum of the line totals, kept even when the posted amount was overridden. */
  lineSum: string;
  amountOverride: boolean;
  amountOverrideReason: string | null;
  supplierReceivingId: string | null;
  supplierReceiving: {
    id: string; referenceNumber: string | null; receivedOn: string;
    items: Array<{ id: string; quantity: number; product: { id: string; name: string; sku: string } }>;
  } | null;
  purchaseLines: SupplierPurchaseLine[];
  createdBy?: SupplierActor;
  createdAt: string;
}

export interface ReceiptCheckResult {
  duplicate: boolean;
  matches: Array<{ id: string; receiptNumber: string | null; amount: string; transactionDate: string; description: string }>;
}

export interface SupplierPurchaseListResult { items: SupplierPurchase[]; pagination: PaginationMeta }
