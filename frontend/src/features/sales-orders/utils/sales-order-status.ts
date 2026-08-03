import type { BadgeTone } from '../../../components/ui';
import type {
  SalesOrder,
  SalesOrderFulfillmentStatus,
  SalesOrderPaymentStatus,
} from '../types/sales-orders.types';

export const FULFILLMENT_TONES: Record<SalesOrderFulfillmentStatus, BadgeTone> = {
  DRAFT: 'neutral', CONFIRMED: 'info', PREPARING: 'brand', READY_FOR_DELIVERY: 'brand',
  OUT_FOR_DELIVERY: 'info', DELIVERED: 'success', CANCELLED: 'danger', RETURNED: 'warning',
};
export const PAYMENT_TONES: Record<SalesOrderPaymentStatus, BadgeTone> = {
  UNPAID: 'danger', PARTIALLY_PAID: 'warning', PAID: 'success',
};
export const NEXT_FULFILLMENT_STATUS: Partial<Record<SalesOrderFulfillmentStatus, SalesOrderFulfillmentStatus>> = {
  DRAFT: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'READY_FOR_DELIVERY',
  READY_FOR_DELIVERY: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'DELIVERED',
};

type SalesOrderPaymentView = Pick<SalesOrder, 'paymentStatus' | 'settlement' | 'debt'>;

export function salesOrderDisplayPaymentStatus(order: SalesOrderPaymentView): SalesOrderPaymentStatus {
  return isPaidSalesOrderDebt(order) ? 'PAID' : order.paymentStatus;
}

export function shouldShowSalesOrderSettlement(order: SalesOrderPaymentView): boolean {
  return order.settlement !== 'NONE' && !isPaidSalesOrderDebt(order);
}

function isPaidSalesOrderDebt(order: SalesOrderPaymentView): boolean {
  return order.settlement === 'DEBT' && order.debt?.status === 'PAID';
}
