import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRaw, productFindMany, movementFindMany } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  productFindMany: vi.fn(),
  movementFindMany: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    $queryRaw: queryRaw,
    product: { findMany: productFindMany },
    stockMovement: { findMany: movementFindMany },
  },
}));
vi.mock('../financial/domain/business-date', () => ({ getBusinessTimezone: () => 'Asia/Beirut' }));

import { InventoryRepository } from './inventory.repository';

describe('inventory onboarding repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a scoped, paginated, searchable worklist with derived statuses', async () => {
    queryRaw
      .mockResolvedValueOnce([
        {
          productId: 'product-1', sku: 'HC-1', name: 'Fan', model: 'F1', brand: 'Brand', barcode: '1234',
          trackStock: false, stockQuantity: 0, movementCount: 0n,
        },
        {
          productId: 'product-2', sku: 'HC-2', name: 'Tracked fan', model: 'F2', brand: null, barcode: null,
          trackStock: true, stockQuantity: 0, movementCount: 0n,
        },
      ])
      .mockResolvedValueOnce([{ total: 12n }]);

    const result = await InventoryRepository.listPendingOnboarding({
      search: 'fan', includeArchived: false, page: 2, pageSize: 2,
    });

    expect(result).toEqual({
      items: [
        expect.objectContaining({ productId: 'product-1', status: 'NOT_IN_INVENTORY' }),
        expect.objectContaining({ productId: 'product-2', status: 'PENDING_ONBOARDING' }),
      ],
      total: 12, page: 2, pageSize: 2,
    });
    const sql = queryRaw.mock.calls.map(([query]) => String(query.strings?.join(' ') ?? query)).join(' ');
    expect(sql).toContain('OPENING_BALANCE');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('p."model" ILIKE');
    expect(sql).toContain('p."brand"');
    expect(sql).toContain('ORDER BY p."name" ASC');
    expect(sql).toContain('OFFSET');
    expect(sql).toContain('LIMIT');
  });

  it('loads only the requested products and their opening movements for classification', async () => {
    const tx = {
      product: { findMany: productFindMany },
      stockMovement: { findMany: movementFindMany },
    } as never;
    productFindMany.mockResolvedValue([]);
    movementFindMany.mockResolvedValue([]);
    const ids = ['product-1', 'product-2'];

    await InventoryRepository.findProductsForOnboarding(ids, tx);
    await InventoryRepository.findOpeningBalances(ids, tx);

    expect(productFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ids } } }));
    expect(movementFindMany).toHaveBeenCalledWith({
      where: { productId: { in: ids }, movementType: 'OPENING_BALANCE' },
      select: { id: true, productId: true },
    });
  });
});
