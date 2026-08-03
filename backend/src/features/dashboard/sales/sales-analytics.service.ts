import { SalesOrderFulfillmentStatus } from '@prisma/client';
import { moneyToApiString, prismaDateToBusinessDate } from '../../financial';
import type { ResolvedDashboardRange } from '../dashboard.types';
import { SalesAnalyticsRepository, type SalesAnalyticsRecords } from './sales-analytics.repository';
import type { SalesAnalyticsData } from './sales-analytics.types';

const PIPELINE = [
  SalesOrderFulfillmentStatus.CONFIRMED,
  SalesOrderFulfillmentStatus.PREPARING,
  SalesOrderFulfillmentStatus.READY_FOR_DELIVERY,
  SalesOrderFulfillmentStatus.OUT_FOR_DELIVERY,
] as const;

export class SalesAnalyticsService {
  static async get(range: ResolvedDashboardRange, businessDate: string): Promise<SalesAnalyticsData> {
    return this.aggregate(await SalesAnalyticsRepository.load(range, businessDate));
  }

  static aggregate(records: SalesAnalyticsRecords): SalesAnalyticsData {
    const fulfillmentCounts = new Map(records.fulfillmentStatusDistribution.map((row) => [row.fulfillmentStatus, row._count._all]));
    const productNames = new Map(records.products.map((product) => [product.id, product.name]));
    return {
      totals: {
        salesToday: moneyToApiString(records.todayAggregate._sum.totalAmount ?? '0.00'),
        ordersToday: records.todayAggregate._count._all,
        pendingDelivery: records.pendingDelivery,
        unpaidOrders: records.unpaidOrders,
        partialPayments: records.partialPayments,
        installmentOrders: records.installmentOrders,
      },
      salesByDay: records.salesByDay.map((row) => ({
        date: prismaDateToBusinessDate(row.orderDate),
        amount: moneyToApiString(row._sum.totalAmount ?? '0.00'),
        orderCount: row._count._all,
      })),
      paymentStatusDistribution: records.paymentStatusDistribution.map((row) => ({ status: row.paymentStatus, count: row._count._all })),
      fulfillmentStatusDistribution: records.fulfillmentStatusDistribution.map((row) => ({ status: row.fulfillmentStatus, count: row._count._all })),
      deliveryPipeline: PIPELINE.map((status) => ({ status, count: fulfillmentCounts.get(status) ?? 0 })),
      topProducts: records.topProductGroups.flatMap((row) => row.productId ? [{
        productId: row.productId,
        productName: productNames.get(row.productId) ?? 'Unknown product',
        quantity: row._sum.quantity ?? 0,
      }] : []),
    };
  }
}
