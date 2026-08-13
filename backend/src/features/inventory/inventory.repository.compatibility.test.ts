import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRaw, findMany } = vi.hoisted(() => ({ queryRaw: vi.fn(), findMany: vi.fn() }));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    $queryRaw: queryRaw,
    stockMovement: { findMany },
  },
}));

vi.mock('../financial/domain/business-date', () => ({
  getBusinessTimezone: () => 'Asia/Beirut',
}));

import { InventoryRepository } from './inventory.repository';

describe('inventory repository pending-migration compatibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the inventory summary readable while the fulfillment migration is pending', async () => {
    queryRaw
      .mockResolvedValueOnce([{ exists: false }])
      .mockResolvedValueOnce([{
        trackedProducts: 2n,
        lowStockProducts: 1n,
        outOfStockProducts: 0n,
        totalUnits: 5n,
        movementsToday: 1n,
      }]);
    findMany.mockResolvedValueOnce([]);

    await expect(InventoryRepository.summary()).resolves.toMatchObject({
      trackedProducts: 2,
      ordersAwaitingStockDeduction: 0,
      recentMovements: [],
    });
    expect(JSON.stringify(findMany.mock.calls[0][0].include)).not.toContain('salesFulfillment');
  });

  it('returns no awaiting orders while the fulfillment table is still pending', async () => {
    queryRaw.mockResolvedValueOnce([{ exists: false }]);

    await expect(InventoryRepository.salesOrderIdsAwaitingStockDeduction()).resolves.toEqual([]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('runs the awaiting-order query after the fulfillment migration exists', async () => {
    queryRaw
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ id: 'order-1' }]);

    await expect(InventoryRepository.salesOrderIdsAwaitingStockDeduction()).resolves.toEqual(['order-1']);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
