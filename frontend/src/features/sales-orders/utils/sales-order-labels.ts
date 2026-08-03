import type { SalesChannel, SalesOrderFulfillmentStatus, SalesOrderPaymentStatus, SalesOrderSettlement } from '../types/sales-orders.types';

export const SALES_CHANNEL_LABELS: Record<SalesChannel, string> = {
  SHOP_DIRECT: 'Shop Direct / بيع مباشر من المحل',
  SHOP_DELIVERY: 'Shop Delivery / طلب مع توصيل',
  PHONE_ORDER: 'Phone Order / طلب عبر الهاتف',
};
export const FULFILLMENT_STATUS_LABELS: Record<SalesOrderFulfillmentStatus, string> = {
  DRAFT: 'Draft / مسودة', CONFIRMED: 'Confirmed / مؤكد', PREPARING: 'Preparing / قيد التحضير',
  READY_FOR_DELIVERY: 'Ready for Delivery / جاهز للتوصيل', OUT_FOR_DELIVERY: 'Out for Delivery / في الطريق',
  DELIVERED: 'Delivered / تم التسليم', CANCELLED: 'Cancelled / ملغى', RETURNED: 'Returned / مرتجع',
};
export const PAYMENT_STATUS_LABELS: Record<SalesOrderPaymentStatus, string> = {
  UNPAID: 'Unpaid / غير مدفوع', PARTIALLY_PAID: 'Partially Paid / مدفوع جزئياً', PAID: 'Paid / مدفوع',
};
export const SETTLEMENT_LABELS: Record<SalesOrderSettlement, string> = {
  NONE: 'No arrangement / بلا ترتيب', DEBT: 'Debt / دين', INSTALLMENT: 'Installment / تقسيط',
};
