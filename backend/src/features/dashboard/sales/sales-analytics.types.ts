import type { SalesOrderFulfillmentStatus, SalesOrderPaymentStatus } from '@prisma/client';

export interface SalesAnalyticsData {
  totals: {
    salesToday: string;
    ordersToday: number;
    pendingDelivery: number;
    unpaidOrders: number;
    partialPayments: number;
    installmentOrders: number;
  };
  salesByDay: Array<{ date: string; amount: string; orderCount: number }>;
  paymentStatusDistribution: Array<{ status: SalesOrderPaymentStatus; count: number }>;
  fulfillmentStatusDistribution: Array<{ status: SalesOrderFulfillmentStatus; count: number }>;
  deliveryPipeline: Array<{ status: SalesOrderFulfillmentStatus; count: number }>;
  topProducts: Array<{ productId: string; productName: string; quantity: number }>;
}
