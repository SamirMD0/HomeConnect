import type { Currency, SalesOrderRead } from '@shared/lookup-contracts';
export interface OrderLine {
  productId: string;
  name: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
}
export interface OrderForm {
  lastScanKey?: string;
  customerId: string;
  customerName: string;
  currency: Currency;
  salesChannel: 'SHOP_DIRECT' | 'SHOP_DELIVERY' | 'PHONE_ORDER';
  orderDate: string;
  paidAmount: string;
  debtDueDate: string;
  deliveryDate: string;
  deliveryFee: string;
  deliveryTaxTreatment: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT';
  deliveryAddress: string;
  deliveryNotes: string;
  items: OrderLine[];
  newCustomer: { name: string; phone: string; address: string; notes: string };
}
export interface PaymentForm {
  customerId: string;
  customerName: string;
  targetType: 'DEBT' | 'INSTALLMENT_PLAN';
  targetId: string;
  targetDescription: string;
  amount: string;
  paymentDate: string;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHECK' | 'OTHER';
  reference: string;
  notes: string;
}
export interface OrderPayload {
  idempotencyKey: string;
  currency: Currency;
  customerId: string | null;
  salesChannel: OrderForm['salesChannel'];
  orderDate: string;
  fulfillmentStatus: 'DRAFT' | 'DELIVERED' | 'CONFIRMED';
  paidAmount: string;
  debtDueDate: string | null;
  items: {
    productId: string;
    manualProductName: null;
    manualProductModel: null;
    quantity: number;
    unitPrice: string;
    discountAmount: string;
  }[];
  deliveryDate?: string | null;
  deliveryFee?: string;
  deliveryTaxTreatment?: OrderForm['deliveryTaxTreatment'];
  deliveryAddressSnapshot?: string | null;
  deliveryNotes?: string | null;
}
export interface PaymentPayload {
  amount: string;
  paymentDate: string;
  paymentMethod: PaymentForm['paymentMethod'];
  reference: string | null;
  notes: string | null;
  idempotencyKey: string;
}
export interface PaymentResult {
  payments: { id: string; idempotencyKey: string | null }[];
}
export type SalesResult =
  | { kind: 'order'; order: SalesOrderRead }
  | { kind: 'payment'; customerId: string; paymentId: string | null };
