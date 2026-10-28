import { SalesOrderFulfillmentStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveReportsPeriod } from '../shared/reports-period';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    customer: { count: vi.fn(), findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    salesReturn: { findMany: vi.fn() },
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
    prismaMock.salesReturn.findMany.mockResolvedValue([]);
    prismaMock.salesOrder.groupBy.mockResolvedValue([]);
  });

  it('uses one inclusive business-date period and excludes soft-deleted new customers', async () => {
    await ReportsMetricsRepository.load(resolveReportsPeriod({
      period: 'custom', from: '2026-07-01', to: '2026-07-31',
    }, '2026-08-17'), phase3cScope);

    const from = new Date('2026-07-01T00:00:00.000Z');
    const toExclusive = new Date('2026-08-01T00:00:00.000Z');
    expect(prismaMock.customer.count).toHaveBeenCalledWith({
      where: { branchId:{in:phase3cScope.branchIds}, deletedAt: null, createdAt: { gte: from, lt: toExclusive } },
    });
    expect(prismaMock.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { branchId:{in:phase3cScope.branchIds}, deletedAt: null, isActive: true },
    }));
  });

  it('counts payments voided after period end as valid at the cutoff', async () => {
    await ReportsMetricsRepository.load(resolveReportsPeriod({
      period: 'custom', from: '2026-07-01', to: '2026-07-31',
    }, '2026-08-17'), phase3cScope);

    const toExclusive = new Date('2026-08-01T00:00:00.000Z');
    expect(prismaMock.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        customer: { deletedAt: null, isActive: true },
        OR: [{ voidedAt: null }, { voidedAt: { gte: toExclusive } }],
      }),
      distinct: ['customerId'],
    }));
  });

  it('excludes drafts and cancellations while preserving returned orders in gross sales', async () => {
    await ReportsMetricsRepository.load(resolveReportsPeriod({
      period: 'custom', from: '2026-07-01', to: '2026-07-31',
    }, '2026-08-17'), phase3cScope);

    expect(prismaMock.salesOrder.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['paymentStatus'],
      where: expect.objectContaining({
        fulfillmentStatus: {
          notIn: [
            SalesOrderFulfillmentStatus.DRAFT,
            SalesOrderFulfillmentStatus.CANCELLED,
          ],
        },
      }),
      _sum: { baseTotalAmount: true, basePaidAmount: true, baseRemainingAmount: true },
    }));
  });
});

const phase3cScope = { mode: 'all' as const, branchIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] };

vi.mock('../../branches/branch-breakdown', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../branches/branch-breakdown')>(),
  branchLabel: vi.fn().mockResolvedValue('Phase 3C A'),
}));
