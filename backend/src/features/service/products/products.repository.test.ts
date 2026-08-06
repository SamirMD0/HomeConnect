import { beforeEach, describe, expect, it, vi } from 'vitest';

const { product, findSearchMatchIds } = vi.hoisted(() => ({
  product: { findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  findSearchMatchIds: vi.fn(),
}));

vi.mock('../../../lib/prisma', () => ({ prisma: { product }, transactionModel: {}, activityLogModel: {} }));
vi.mock('../../../lib/search-query', () => ({ findSearchMatchIds }));

import { ProductsRepository } from './products.repository';

const rows = Array.from({ length: 50 }, (_, index) => ({ id: `product-${index + 1}`, sku: `HC-${String(index + 1).padStart(6, '0')}`, barcode: null }));
const params = { search: 'HC-000050', isActive: true, sortBy: 'name' as const, sortOrder: 'asc' as const, skip: 0, take: 25 };

describe('product repository list pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findSearchMatchIds.mockResolvedValue(rows.map((row) => row.id));
    product.findFirst.mockResolvedValue(rows[49]);
    product.count.mockResolvedValue(rows.length);
    product.findMany.mockImplementation(({ skip, take }) => Promise.resolve(rows.slice(0, 49).slice(skip, skip + take)));
  });

  it('keeps an exact SKU first without dropping or duplicating rows across pages', async () => {
    const page1 = await ProductsRepository.list(params);
    const page2 = await ProductsRepository.list({ ...params, skip: 25 });
    const ids = [...page1.items, ...page2.items].map((row) => row.id);

    expect(page1.items[0].id).toBe('product-50');
    expect(ids).toHaveLength(50);
    expect(new Set(ids).size).toBe(50);
    expect(ids).toEqual(expect.arrayContaining(rows.map((row) => row.id)));
  });

  it('returns immediately when token search has no matching ids', async () => {
    findSearchMatchIds.mockResolvedValue([]);
    await expect(ProductsRepository.list(params)).resolves.toEqual({ items: [], total: 0 });
    expect(product.count).not.toHaveBeenCalled();
    expect(product.findMany).not.toHaveBeenCalled();
  });
});
