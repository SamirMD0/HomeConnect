import { SalesOrderFulfillmentStatus, SalesOrderPaymentStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { SalesAnalyticsService } from './sales-analytics.service';

describe('SalesAnalyticsService', () => {
  it('serializes sales money and never exposes receivables figures', () => {
    const result = SalesAnalyticsService.aggregate({
      todayAggregate: { _sum: { totalAmount: { toString: () => '450' } }, _count: { _all: 2 } },
      pendingDelivery: 1,
      unpaidOrders: 1,
      partialPayments: 1,
      installmentOrders: 0,
      salesByDay: [{ orderDate: new Date('2026-08-03T00:00:00Z'), _sum: { totalAmount: { toString: () => '450' } }, _count: { _all: 2 } }],
      paymentStatusDistribution: [{ paymentStatus: SalesOrderPaymentStatus.PARTIALLY_PAID, _count: { _all: 1 } }],
      fulfillmentStatusDistribution: [{ fulfillmentStatus: SalesOrderFulfillmentStatus.CONFIRMED, _count: { _all: 1 } }],
      topProductGroups: [{ productId: 'p1', _sum: { quantity: 3 } }],
      products: [{ id: 'p1', name: 'Air conditioner' }],
    } as never);

    expect(result.totals.salesToday).toBe('450.00');
    expect(result.salesByDay[0].amount).toBe('450.00');
    expect(result.topProducts).toEqual([{ productId: 'p1', productName: 'Air conditioner', quantity: 3 }]);
    const responseKeys = JSON.stringify(result);
    expect(responseKeys).not.toMatch(/receivable|outstanding|remainingBalance|collected/i);
  });

  it('fills missing delivery pipeline stages with zero', () => {
    const result = SalesAnalyticsService.aggregate({
      todayAggregate: { _sum: { totalAmount: null }, _count: { _all: 0 } },
      pendingDelivery: 0, unpaidOrders: 0, partialPayments: 0, installmentOrders: 0,
      salesByDay: [], paymentStatusDistribution: [], fulfillmentStatusDistribution: [], topProductGroups: [], products: [],
    } as never);
    expect(result.totals.salesToday).toBe('0.00');
    expect(result.deliveryPipeline).toHaveLength(4);
    expect(result.deliveryPipeline.every((stage) => stage.count === 0)).toBe(true);
  });
});
