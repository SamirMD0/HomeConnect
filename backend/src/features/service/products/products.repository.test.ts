import { beforeEach, describe, expect, it, vi } from 'vitest';

const { product, findSearchMatchIds, lowStockThresholdField } = vi.hoisted(() => {
  const lowStockThresholdField = { kind: 'Product.lowStockThreshold field reference' };
  return {
    lowStockThresholdField,
    product: {
      fields: { lowStockThreshold: lowStockThresholdField },
      findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), update: vi.fn(),
    },
    findSearchMatchIds: vi.fn(),
  };
});

vi.mock('../../../lib/prisma', () => ({ prisma: { product }, transactionModel: {}, activityLogModel: {} }));
vi.mock('../../../lib/search-query', () => ({ findSearchMatchIds }));

import { deriveProductStockStatus, PRODUCT_STOCK_FILTERS } from './product-stock';
import { productStockStatusWhere, ProductsRepository } from './products.repository';

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

  it('honours an explicit track-stock filter in both count and page queries', async () => {
    findSearchMatchIds.mockResolvedValue(undefined);
    product.findMany.mockResolvedValue([]);
    product.count.mockResolvedValue(0);

    await ProductsRepository.list({ ...params, search: undefined, trackStock: false });

    expect(product.count).toHaveBeenCalledWith({ where: expect.objectContaining({ trackStock: false }) });
    expect(product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ trackStock: false }),
      take: 25,
    }));
  });

  it('combines stock status with search in count, page, and exact-match queries', async () => {
    await ProductsRepository.list({ ...params, stockStatus: 'LOW_STOCK' });

    const stock = productStockStatusWhere('LOW_STOCK');
    const combined = expect.objectContaining({ id: { in: rows.map((row) => row.id) }, ...stock });
    expect(product.count).toHaveBeenCalledWith({ where: combined });
    expect(product.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [combined, expect.objectContaining({ OR: expect.any(Array) })] },
    }));
    expect(product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [combined, { id: { not: rows[49].id } }] },
    }));
  });

  it('maps stock sorting to quantity and preserves every ordinary sort column', async () => {
    findSearchMatchIds.mockResolvedValue(undefined);
    product.findMany.mockResolvedValue([]);
    product.count.mockResolvedValue(0);

    await ProductsRepository.list({ ...params, search: undefined, sortBy: 'stock', sortOrder: 'desc' });
    expect(product.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      orderBy: [{ stockQuantity: 'desc' }, { id: 'asc' }],
    }));

    for (const sortBy of ['name', 'model', 'brand', 'price', 'createdAt', 'updatedAt'] as const) {
      await ProductsRepository.list({ ...params, search: undefined, sortBy, sortOrder: 'asc' });
      expect(product.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
        orderBy: [{ [sortBy]: 'asc' }, { id: 'asc' }],
      }));
    }
  });

  it('uses case-insensitive unique-field courtesy checks without changing authoritative exact lookups', async () => {
    product.findUnique.mockResolvedValue(rows[0]);
    product.findFirst.mockResolvedValue(rows[1]);

    await ProductsRepository.findByBarcode('AbC-1234');
    await ProductsRepository.findByBarcode('AbC-1234', undefined, { caseInsensitive: true, excludeProductId: 'subject-id' });
    await ProductsRepository.findBySku('hc-000002', undefined, { caseInsensitive: true, excludeProductId: 'subject-id' });

    expect(product.findUnique).toHaveBeenCalledWith({ where: { barcode: 'AbC-1234' } });
    expect(product.findFirst).toHaveBeenNthCalledWith(1, { where: {
      barcode: { equals: 'AbC-1234', mode: 'insensitive' },
      id: { not: 'subject-id' },
    } });
    expect(product.findFirst).toHaveBeenNthCalledWith(2, { where: {
      sku: { equals: 'hc-000002', mode: 'insensitive' },
      id: { not: 'subject-id' },
    } });
  });

  it('queries same-name/model and different-name model/brand buckets case-insensitively', async () => {
    product.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await ProductsRepository.findDuplicates({
      name: 'fAn', model: 'f1', brand: 'aRiEtE', excludeProductId: 'subject-id',
    });

    expect(product.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        id: { not: 'subject-id' },
        name: { equals: 'fAn', mode: 'insensitive' },
        model: { equals: 'f1', mode: 'insensitive' },
        brand: { equals: 'aRiEtE', mode: 'insensitive' },
      },
      take: 5,
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
    }));
    expect(product.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        id: { not: 'subject-id' },
        model: { equals: 'f1', mode: 'insensitive' },
        brand: { equals: 'aRiEtE', mode: 'insensitive' },
        NOT: { name: { equals: 'fAn', mode: 'insensitive' } },
      }),
    }));
    const select = product.findMany.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(['barcode', 'brand', 'id', 'isActive', 'model', 'name', 'sku', 'updatedAt']);
  });

  it('aggregates stored brand spellings in the database without loading products', async () => {
    product.groupBy.mockResolvedValue([{ brand: 'Kozano', _count: { _all: 12 } }]);

    await expect(ProductsRepository.groupBrandSpellings()).resolves.toHaveLength(1);

    expect(product.groupBy).toHaveBeenCalledWith({
      by: ['brand'], where: { brand: { not: null } }, _count: { _all: true },
    });
    expect(product.findMany).not.toHaveBeenCalled();
  });

  it('selects normalization candidates by exact stored spelling and updates only brand metadata', async () => {
    product.findMany.mockResolvedValue([]);
    product.update.mockResolvedValue({ id: 'product-1', sku: 'HC-000001', name: 'Fan', brand: 'General' });

    await ProductsRepository.findForBrandNormalization(['General', 'GENERAL'], 'General');
    await ProductsRepository.updateBrand('product-1', 'General', 'admin-1', { product } as never);

    expect(product.findMany).toHaveBeenCalledWith({
      where: { brand: { in: ['General', 'GENERAL'], not: 'General' } },
      select: { id: true, sku: true, name: true, brand: true },
      orderBy: [{ sku: 'asc' }, { id: 'asc' }],
    });
    expect(product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { brand: 'General', updatedById: 'admin-1' },
      select: { id: true, sku: true, name: true, brand: true },
    });
  });
});

describe('product stock status where clauses', () => {
  it('builds the exact Prisma fragment for all five catalogue filters', () => {
    expect(productStockStatusWhere('NOT_TRACKED')).toEqual({ trackStock: false });
    expect(productStockStatusWhere('OUT_OF_STOCK')).toEqual({ trackStock: true, stockQuantity: 0 });
    expect(productStockStatusWhere('LOW_STOCK')).toEqual({
      trackStock: true,
      lowStockThreshold: { not: null },
      stockQuantity: { gt: 0, lte: lowStockThresholdField },
    });
    expect(productStockStatusWhere('IN_STOCK')).toEqual({
      trackStock: true,
      stockQuantity: { gt: 0 },
      OR: [
        { lowStockThreshold: null },
        { stockQuantity: { gt: lowStockThresholdField } },
      ],
    });
    expect(productStockStatusWhere('NOT_IN_INVENTORY')).toEqual({
      trackStock: false,
      stockQuantity: 0,
      stockMovements: { none: {} },
    });
  });

  it.each([
    [{ trackStock: false, stockQuantity: 0, lowStockThreshold: null, movementCount: 1 }, 'NOT_TRACKED'],
    [{ trackStock: true, stockQuantity: 0, lowStockThreshold: 2, movementCount: 1 }, 'OUT_OF_STOCK'],
    [{ trackStock: true, stockQuantity: 2, lowStockThreshold: 2, movementCount: 1 }, 'LOW_STOCK'],
    [{ trackStock: true, stockQuantity: 3, lowStockThreshold: 2, movementCount: 1 }, 'IN_STOCK'],
    [{ trackStock: true, stockQuantity: 4, lowStockThreshold: null, movementCount: 1 }, 'IN_STOCK'],
  ] as const)('keeps badge derivation and filter predicates aligned for %o', (row, expected) => {
    expect(deriveProductStockStatus(row)).toBe(expected);
    const matchingBadgeFilters = PRODUCT_STOCK_FILTERS
      .filter((filter) => matchesProductWhere(row, productStockStatusWhere(filter)));
    expect(matchingBadgeFilters).toEqual([expected]);
  });

  it('matches the never-entered-inventory predicate only when movement history is empty', () => {
    const outside = { trackStock: false, stockQuantity: 0, lowStockThreshold: null, movementCount: 0 };
    expect(matchesProductWhere(outside, productStockStatusWhere('NOT_IN_INVENTORY'))).toBe(true);
    expect(matchesProductWhere({ ...outside, movementCount: 1 }, productStockStatusWhere('NOT_IN_INVENTORY'))).toBe(false);
  });
});

type StockRow = { trackStock: boolean; stockQuantity: number; lowStockThreshold: number | null; movementCount: number };

function matchesProductWhere(row: StockRow, where: Record<string, unknown>): boolean {
  if (typeof where.trackStock === 'boolean' && row.trackStock !== where.trackStock) return false;
  if (typeof where.stockQuantity === 'number' && row.stockQuantity !== where.stockQuantity) return false;
  if (where.lowStockThreshold === null && row.lowStockThreshold !== null) return false;
  if (isRecord(where.lowStockThreshold) && where.lowStockThreshold.not === null && row.lowStockThreshold === null) return false;
  if (isRecord(where.stockQuantity)) {
    if (typeof where.stockQuantity.gt === 'number' && row.stockQuantity <= where.stockQuantity.gt) return false;
    if (where.stockQuantity.gt === lowStockThresholdField
        && (row.lowStockThreshold === null || row.stockQuantity <= row.lowStockThreshold)) return false;
    if (where.stockQuantity.lte === lowStockThresholdField
        && (row.lowStockThreshold === null || row.stockQuantity > row.lowStockThreshold)) return false;
  }
  if (Array.isArray(where.OR) && !where.OR.some((fragment) => matchesProductWhere(row, fragment as Record<string, unknown>))) return false;
  if (isRecord(where.stockMovements) && isRecord(where.stockMovements.none) && row.movementCount !== 0) return false;
  return true;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
