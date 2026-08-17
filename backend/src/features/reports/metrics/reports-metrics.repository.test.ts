import { SalesOrderFulfillmentStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveReportsPeriod } from '../shared/reports-period';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    customer: { count: vi.fn(), findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    salesOrder: { groupBy: vi.fn() },
  },
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: prismaMock,
  transactionModel: {},
  activityLogModel: {},
}));

import { ReportsMetricsRepository } from './reports-metrics.repository';

describe('ReportsMetricsRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.customer.count.mockResolvedValue(0);
    prismaMock.customer.findMany.mockResolvedValue([]);
    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.salesOrder.groupBy.mockResolvedValue([]);
  });

  it('uses one inclusive business-date period and excludes soft-deleted new customers', async () => {
    await ReportsMetricsRepository.load(resolveReportsPeriod({
      period: 'custom', from: '2026-07-01', to: '2026-07-31',
    }, '2026-08-17'));

    const from = new Date('2026-07-01T00:00:00.000Z');
    const toExclusive = new Date('2026-08-01T00:00:00.000Z');
    expect(prismaMock.customer.count).toHaveBeenCalledWith({
      where: { deletedAt: null, createdAt: { gte: from, lt: toExclusive } },
    });
    expect(prismaMock.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { deletedAt: null, isActive: true },
    }));
  });

  it('counts payments voided after period end as valid at the cutoff', async () => {
    await ReportsMetricsRepository.load(resolveReportsPeriod({
      period: 'custom', from: '2026-07-01', to: '2026-07-31',
    }, '2026-08-17'));

    const toExclusive = new Date('2026-08-01T00:00:00.000Z');
    expect(prismaMock.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        customer: { deletedAt: null, isActive: true },
        OR: [{ voidedAt: null }, { voidedAt: { gte: toExclusive } }],
      }),
      distinct: ['customerId'],
    }));
  });

  it('excludes draft, cancelled, and returned orders from period sales', async () => {
    await ReportsMetricsRepository.load(resolveReportsPeriod({
      period: 'custom', from: '2026-07-01', to: '2026-07-31',
    }, '2026-08-17'));

    expect(prismaMock.salesOrder.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['paymentStatus'],
      where: expect.objectContaining({
        fulfillmentStatus: {
          notIn: [
            SalesOrderFulfillmentStatus.DRAFT,
            SalesOrderFulfillmentStatus.CANCELLED,
            SalesOrderFulfillmentStatus.RETURNED,
          ],
        },
      }),
      _sum: { totalAmount: true, paidAmount: true, remainingAmount: true },
    }));
  });
});
