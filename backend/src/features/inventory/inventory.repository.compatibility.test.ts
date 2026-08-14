import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRaw, findMany, count } = vi.hoisted(() => ({ queryRaw: vi.fn(), findMany: vi.fn(), count: vi.fn() }));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    $queryRaw: queryRaw,
    stockMovement: { findMany, count },
  },
}));

vi.mock('../financial/domain/business-date', () => ({
  getBusinessTimezone: () => 'Asia/Beirut',
}));

import { InventoryRepository } from './inventory.repository';

describe('inventory repository pending-migration compatibility', () => {
  beforeEach(() => vi.clearAllMocks());

  const movement = {
    id: 'movement-1', productId: 'product-1', movementType: 'PURCHASE_RECEIPT', quantityChange: 3,
    quantityBefore: 2, quantityAfter: 5, reason: 'Stock received', note: null, referenceType: 'SUPPLIER_RECEIVING_ITEM',
    referenceId: 'item-1', createdById: 'user-1', createdAt: new Date('2026-08-14T10:00:00.000Z'),
    product: { id: 'product-1', sku: 'HC-1', name: 'Fan', trackStock: true, stockQuantity: 5 }, createdBy: null,
  };

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
    expect(JSON.stringify(findMany.mock.calls[0][0].include)).not.toContain('supplierReceivingItem');
  });

  it('keeps global and product movement history readable while receiving tables are pending', async () => {
    queryRaw.mockResolvedValueOnce([{ exists: false }]);
    findMany.mockResolvedValueOnce([movement]);
    count.mockResolvedValueOnce(1);

    const result = await InventoryRepository.listMovements({ productId: 'product-1', page: 1, pageSize: 10 });

    expect(findMany.mock.calls[0][0].where).toMatchObject({ productId: 'product-1' });
    expect(JSON.stringify(findMany.mock.calls[0][0].include)).not.toContain('supplierReceivingItem');
    expect(result.items[0]).toMatchObject({ movementType: 'PURCHASE_RECEIPT', receivingMetadata: null });
  });

  it('adds receiving metadata to global and product movement history after migration', async () => {
    queryRaw.mockResolvedValueOnce([{ exists: true }]);
    findMany.mockResolvedValueOnce([{
      ...movement,
      supplierReceivingItem: {
        id: 'item-1',
        receiving: {
          id: 'receiving-1', supplierId: 'supplier-1', referenceNumber: 'INV-77',
          receivedOn: new Date('2026-08-14T00:00:00.000Z'), supplier: { id: 'supplier-1', name: 'Supplier One' },
        },
      },
    }]);
    count.mockResolvedValueOnce(1);

    const result = await InventoryRepository.listMovements({ productId: 'product-1' });

    expect(JSON.stringify(findMany.mock.calls[0][0].include)).toContain('supplierReceivingItem');
    expect(result.items[0]).toMatchObject({
      movementType: 'PURCHASE_RECEIPT',
      receivingMetadata: {
        receivingId: 'receiving-1', receivingItemId: 'item-1', supplierId: 'supplier-1',
        supplierName: 'Supplier One', referenceNumber: 'INV-77', receivedOn: '2026-08-14',
      },
    });
    expect(result.items[0]).not.toHaveProperty('supplierReceivingItem');
  });

  it('adds receiving metadata to summary movements without requiring the sales relation', async () => {
    queryRaw
      .mockResolvedValueOnce([{ fulfillmentExists: false, receivingExists: true }])
      .mockResolvedValueOnce([{ trackedProducts: 1n, lowStockProducts: 0n, outOfStockProducts: 0n, totalUnits: 5n, movementsToday: 1n }]);
    findMany.mockResolvedValueOnce([{
      ...movement,
      supplierReceivingItem: {
        id: 'item-1', receiving: { id: 'receiving-1', supplierId: null, referenceNumber: null, receivedOn: new Date('2026-08-14T00:00:00.000Z'), supplier: null },
      },
    }]);

    const result = await InventoryRepository.summary();

    expect(JSON.stringify(findMany.mock.calls[0][0].include)).toContain('supplierReceivingItem');
    expect(JSON.stringify(findMany.mock.calls[0][0].include)).not.toContain('salesFulfillment');
    expect(result.recentMovements[0]).toMatchObject({ receivingMetadata: { receivingId: 'receiving-1', supplierId: null, supplierName: null } });
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
