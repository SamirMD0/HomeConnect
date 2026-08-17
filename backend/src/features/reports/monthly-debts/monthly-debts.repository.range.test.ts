import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    debt: { findMany: vi.fn() },
    installmentPlan: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
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
});
