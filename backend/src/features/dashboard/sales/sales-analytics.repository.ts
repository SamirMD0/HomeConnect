import {
  SalesChannel,
  SalesOrderFulfillmentStatus,
  SalesOrderPaymentStatus,
  SalesOrderSettlement,
} from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { businessDateToPrisma } from '../../financial';
import type { ResolvedDashboardRange } from '../dashboard.types';

const EXCLUDED = [
  SalesOrderFulfillmentStatus.DRAFT,
  SalesOrderFulfillmentStatus.CANCELLED,
  SalesOrderFulfillmentStatus.RETURNED,
];

export class SalesAnalyticsRepository {
  static async load(range: ResolvedDashboardRange, businessDate: string) {
    const from = businessDateToPrisma(range.from);
    const rangeEnd = nextDay(range.to);
    const today = businessDateToPrisma(businessDate);
    const tomorrow = nextDay(businessDate);
    const counted = { fulfillmentStatus: { notIn: EXCLUDED } };
    const ranged = { ...counted, orderDate: { gte: from, lt: rangeEnd } };

    const [
      todayAggregate,
      pendingDelivery,
      unpaidOrders,
      partialPayments,
      installmentOrders,
      salesByDay,
      paymentStatusDistribution,
      fulfillmentStatusDistribution,
      topProductGroups,
    ] = await Promise.all([
      prisma.salesOrder.aggregate({
        where: { ...counted, orderDate: { gte: today, lt: tomorrow } },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.salesOrder.count({
        where: {
          salesChannel: { in: [SalesChannel.SHOP_DELIVERY, SalesChannel.PHONE_ORDER] },
          fulfillmentStatus: { in: [
            SalesOrderFulfillmentStatus.CONFIRMED,
            SalesOrderFulfillmentStatus.PREPARING,
            SalesOrderFulfillmentStatus.READY_FOR_DELIVERY,
            SalesOrderFulfillmentStatus.OUT_FOR_DELIVERY,
          ] },
        },
      }),
      prisma.salesOrder.count({ where: { ...counted, paymentStatus: SalesOrderPaymentStatus.UNPAID } }),
      prisma.salesOrder.count({ where: { ...counted, paymentStatus: SalesOrderPaymentStatus.PARTIALLY_PAID } }),
      prisma.salesOrder.count({ where: { ...counted, settlement: SalesOrderSettlement.INSTALLMENT } }),
      prisma.salesOrder.groupBy({
        by: ['orderDate'], where: ranged, _sum: { totalAmount: true }, _count: { _all: true }, orderBy: { orderDate: 'asc' },
      }),
      prisma.salesOrder.groupBy({
        by: ['paymentStatus'], where: ranged, _count: { _all: true }, orderBy: { paymentStatus: 'asc' },
      }),
      prisma.salesOrder.groupBy({
        by: ['fulfillmentStatus'], where: { orderDate: { gte: from, lt: rangeEnd } }, _count: { _all: true }, orderBy: { fulfillmentStatus: 'asc' },
      }),
      prisma.salesOrderItem.groupBy({
        by: ['productId'],
        where: { productId: { not: null }, salesOrder: ranged },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
    ]);

    const productIds = topProductGroups.flatMap((group) => group.productId ? [group.productId] : []);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    return {
      todayAggregate, pendingDelivery, unpaidOrders, partialPayments, installmentOrders,
      salesByDay, paymentStatusDistribution, fulfillmentStatusDistribution, topProductGroups, products,
    };
  }
}

function nextDay(value: string): Date {
  const date = businessDateToPrisma(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export type SalesAnalyticsRecords = Awaited<ReturnType<typeof SalesAnalyticsRepository.load>>;
