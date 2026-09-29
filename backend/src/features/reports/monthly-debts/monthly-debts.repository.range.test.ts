import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    debt: { findMany: vi.fn() },
    installmentPlan: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    salesReturn: { findMany: vi.fn() },
  },
}));

vi.mock('../../../lib/prisma', () => ({
  prisma: prismaMock,
  transactionModel: {},
  activityLogModel: {},
}));

import { MonthlyDebtsRepository } from './monthly-debts.repository';

describe('MonthlyDebtsRepository range cutoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.debt.findMany.mockResolvedValue([]);
    prismaMock.installmentPlan.findMany.mockResolvedValue([]);
    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.salesReturn.findMany.mockResolvedValue([]);
  });

  it('excludes user-dated payments after the explicit to date', async () => {
    const startDate = new Date('2026-07-28T00:00:00.000Z');
    const endDate = new Date('2026-08-03T00:00:00.000Z');
    const nextDayAfterEnd = new Date('2026-08-04T00:00:00.000Z');

    await MonthlyDebtsRepository.loadActivityRecords({ startDate, endDate, nextDayAfterEnd });

    expect(prismaMock.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ paymentDate: { gte: startDate, lte: endDate } }),
    }));
  });

  it('filters createdAt timestamps by the Beirut business-day UTC instants when supplied', async () => {
    // Beirut on 2026-08-13 (+03:00): business day starts at 2026-08-12T21:00Z.
    const startDate = new Date('2026-08-13T00:00:00.000Z');
    const endDate = new Date('2026-08-13T00:00:00.000Z');
    const nextDayAfterEnd = new Date('2026-08-14T00:00:00.000Z');
    const startInstantUtc = new Date('2026-08-12T21:00:00.000Z');
    const endInstantExclusiveUtc = new Date('2026-08-13T21:00:00.000Z');

    await MonthlyDebtsRepository.loadActivityRecords({
      startDate, endDate, nextDayAfterEnd, startInstantUtc, endInstantExclusiveUtc,
    });

    expect(prismaMock.debt.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdAt: { gte: startInstantUtc, lt: endInstantExclusiveUtc } }),
    }));
    expect(prismaMock.installmentPlan.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdAt: { gte: startInstantUtc, lt: endInstantExclusiveUtc } }),
    }));
    // Date-only columns keep the UTC-midnight boundaries — they never shift under DST.
    expect(prismaMock.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ paymentDate: { gte: startDate, lte: endDate } }),
    }));
    expect(prismaMock.salesReturn.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ returnDate: { gte: startDate, lt: nextDayAfterEnd } }),
    }));
  });

  it('handles a Beirut standard-time (+02:00) business-day window', async () => {
    // Beirut on 2026-01-15 (+02:00): business day starts at 2026-01-14T22:00Z.
    const startInstantUtc = new Date('2026-01-14T22:00:00.000Z');
    const endInstantExclusiveUtc = new Date('2026-01-15T22:00:00.000Z');

    await MonthlyDebtsRepository.loadActivityRecords({
      startDate: new Date('2026-01-15T00:00:00.000Z'),
      endDate: new Date('2026-01-15T00:00:00.000Z'),
      nextDayAfterEnd: new Date('2026-01-16T00:00:00.000Z'),
      startInstantUtc, endInstantExclusiveUtc,
    });

    expect(prismaMock.debt.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdAt: { gte: startInstantUtc, lt: endInstantExclusiveUtc } }),
    }));
  });

  it('falls back to UTC-midnight createdAt boundaries when instant boundaries are omitted', async () => {
    const startDate = new Date('2026-07-28T00:00:00.000Z');
    const endDate = new Date('2026-08-03T00:00:00.000Z');
    const nextDayAfterEnd = new Date('2026-08-04T00:00:00.000Z');

    await MonthlyDebtsRepository.loadActivityRecords({ startDate, endDate, nextDayAfterEnd });

    expect(prismaMock.debt.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdAt: { gte: startDate, lt: nextDayAfterEnd } }),
    }));
  });
});
