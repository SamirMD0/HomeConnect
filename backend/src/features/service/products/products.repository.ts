import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { findSearchMatchIds } from '../../../lib/search-query';
import { serviceJobInclude } from '../service-jobs/service-jobs.repository';
import type { ProductStockFilter } from './product-stock';

const productActorInclude = {
  createdBy: { select: { fullName: true, username: true } },
  updatedBy: { select: { fullName: true, username: true } },
  pricingPreset: true,
  // Metadata only — never select `data`, or every product query would load image payloads.
  image: { select: { mimeType: true, byteSize: true, updatedAt: true } },
  pricingCardFeatures: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.ProductInclude;

/**
 * The list adds one aggregate the detail read does not need: whether a product
 * has ever had a stock movement, which separates "not tracked" from "never
 * entered inventory". Prisma resolves `_count` as a single grouped query per
 * page, not one per row.
 */
const productListInclude = {
  ...productActorInclude,
  _count: { select: { stockMovements: true } },
} satisfies Prisma.ProductInclude;

export type ProductListRow = Prisma.ProductGetPayload<{ include: typeof productListInclude }>;

/**
 * Translates a stock filter into a `where` fragment that matches
 * `deriveProductStockStatus` exactly — the filter must never return a row whose
 * badge says something else.
 *
 * `LOW_STOCK` and `IN_STOCK` compare two columns of the same row. That is a
 * Prisma field reference (`prisma.product.fields`), not raw SQL, so pagination,
 * counting, and ordering all stay inside the query builder.
 */
export function productStockStatusWhere(status: ProductStockFilter): Prisma.ProductWhereInput {
  switch (status) {
    case 'NOT_TRACKED':
      return { trackStock: false };
    case 'OUT_OF_STOCK':
      return { trackStock: true, stockQuantity: 0 };
    case 'LOW_STOCK':
      return {
        trackStock: true,
        lowStockThreshold: { not: null },
        stockQuantity: { gt: 0, lte: prisma.product.fields.lowStockThreshold },
      };
    case 'IN_STOCK':
      return {
        trackStock: true,
        stockQuantity: { gt: 0 },
        OR: [
          { lowStockThreshold: null },
          { stockQuantity: { gt: prisma.product.fields.lowStockThreshold } },
        ],
      };
    case 'NOT_IN_INVENTORY':
      return { trackStock: false, stockQuantity: 0, stockMovements: { none: {} } };
  }
}

/** `stock` sorts on the quantity column; every other option is already a column name. */
const productSortColumn = (sortBy: ProductListSortBy) => sortBy === 'stock' ? 'stockQuantity' : sortBy;

type ProductListSortBy = 'name' | 'model' | 'brand' | 'price' | 'stock' | 'createdAt' | 'updatedAt';

const productBrandNormalizeSelect = {
  id: true,
  sku: true,
  name: true,
  brand: true,
} satisfies Prisma.ProductSelect;

export class ProductsRepository {
  static groupBrandSpellings() {
    return prisma.product.groupBy({
      by: ['brand'],
      where: { brand: { not: null } },
      _count: { _all: true },
    });
  }

  static findForBrandNormalization(sourceBrands: string[], targetBrand: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).product.findMany({
      where: { brand: { in: sourceBrands, not: targetBrand } },
      select: productBrandNormalizeSelect,
      orderBy: [{ sku: 'asc' }, { id: 'asc' }],
    });
  }

  static findExactBrandUsage(brand: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).product.findFirst({ where: { brand }, select: { id: true } });
  }

  static updateBrand(id: string, brand: string, updatedById: string, tx: Prisma.TransactionClient) {
    return tx.product.update({
      where: { id },
      data: { brand, updatedById },
      select: productBrandNormalizeSelect,
    });
  }

  static findById(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).product.findUnique({ where: { id }, include: productActorInclude });
  }

  /**
   * Bulk label lookup. Only `pricingPreset` is included: the price code needs it
   * (a product with `pricingPresetId` set but the relation unloaded resolves as
   * MISSING_PRESET), while actor and image metadata never reach a label.
   */
  static findManyForLabels(ids: string[], tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).product.findMany({
      where: { id: { in: ids } },
      include: { pricingPreset: true, pricingCardFeatures: { orderBy: { position: 'asc' } } },
    });
  }

  static findByBarcode(
    barcode: string,
    tx?: Prisma.TransactionClient,
    options: { caseInsensitive?: boolean; excludeProductId?: string } = {}
  ) {
    const product = (tx ?? prisma).product;
    if (options.caseInsensitive) {
      return product.findFirst({
        where: {
          barcode: { equals: barcode, mode: 'insensitive' },
          ...(options.excludeProductId ? { id: { not: options.excludeProductId } } : {}),
        },
      });
    }
    return product.findUnique({ where: { barcode } });
  }

  static findBySku(
    sku: string,
    tx?: Prisma.TransactionClient,
    options: { caseInsensitive?: boolean; excludeProductId?: string } = {}
  ) {
    const product = (tx ?? prisma).product;
    if (options.caseInsensitive) {
      return product.findFirst({
        where: {
          sku: { equals: sku, mode: 'insensitive' },
          ...(options.excludeProductId ? { id: { not: options.excludeProductId } } : {}),
        },
      });
    }
    return product.findUnique({ where: { sku } });
  }

  /**
   * Exact scan lookup across both printed code sources.
   *
   * `findByBarcode`/`findBySku` above cannot serve this: they are `findUnique`,
   * and Prisma cannot apply `mode: 'insensitive'` to a unique lookup, so a code
   * scanned in the other case would miss. This mirrors the insensitive OR the
   * list query already uses to hoist exact matches.
   *
   * `take: 2` is the whole result space, not a page: both columns are unique,
   * so at most one row can match on barcode and one on SKU. Returning both lets
   * the caller detect and report that cross-match rather than silently picking.
   */
  static findByScanCode(code: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).product.findMany({
      where: {
        OR: [
          { barcode: { equals: code, mode: 'insensitive' } },
          { sku: { equals: code, mode: 'insensitive' } },
        ],
      },
      take: 2,
    });
  }

  static async list(params: {
    search?: string;
    isActive?: boolean;
    brand?: string;
    hasBarcode?: boolean;
    trackStock?: boolean;
    stockStatus?: ProductStockFilter;
    sortBy: ProductListSortBy;
    sortOrder: 'asc' | 'desc';
    skip: number;
    take: number;
  }) {
    const searchMatchIds = await findSearchMatchIds('product', params.search);
    if (searchMatchIds?.length === 0) return { items: [] as ProductListRow[], total: 0 };
    const where: Prisma.ProductWhereInput = {
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(params.brand ? { brand: { equals: params.brand, mode: 'insensitive' } } : {}),
      ...(params.hasBarcode === undefined ? {} : params.hasBarcode ? { barcode: { not: null } } : { barcode: null }),
      ...(params.trackStock === undefined ? {} : { trackStock: params.trackStock }),
      ...(params.stockStatus ? productStockStatusWhere(params.stockStatus) : {}),
      ...(searchMatchIds ? { id: { in: searchMatchIds } } : {}),
    };
    const [exact, total] = await Promise.all([
      params.search ? prisma.product.findFirst({
        where: {
          AND: [where, { OR: [
            { sku: { equals: params.search, mode: 'insensitive' } },
            { barcode: { equals: params.search, mode: 'insensitive' } },
          ] }],
        },
        include: productListInclude,
      }) : Promise.resolve(null),
      prisma.product.count({ where }),
    ]);
    const hoistExact = exact != null && params.skip === 0;
    const remaining = await prisma.product.findMany({
      where: exact ? { AND: [where, { id: { not: exact.id } }] } : where,
      include: productListInclude,
      skip: exact ? Math.max(0, params.skip - 1) : params.skip,
      take: Math.max(0, params.take - (hoistExact ? 1 : 0)),
      orderBy: [{ [productSortColumn(params.sortBy)]: params.sortOrder }, { id: 'asc' }],
    });
    const items = hoistExact ? [exact, ...remaining] : remaining;
    return { items, total };
  }

  static async findDuplicates(params: {
    name: string;
    model: string;
    brand?: string | null;
    excludeProductId?: string;
  }) {
    const select = {
      id: true, name: true, model: true, brand: true, sku: true,
      barcode: true, isActive: true, updatedAt: true,
    } satisfies Prisma.ProductSelect;
    const orderBy = [{ isActive: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }] satisfies Prisma.ProductOrderByWithRelationInput[];
    const exclude = params.excludeProductId ? { id: { not: params.excludeProductId } } : {};
    const [sameNameModel, sameModelBrand] = await Promise.all([
      prisma.product.findMany({
        where: {
          ...exclude,
          name: { equals: params.name, mode: 'insensitive' },
          model: { equals: params.model, mode: 'insensitive' },
          ...(params.brand ? { brand: { equals: params.brand, mode: 'insensitive' } } : {}),
        },
        select,
        orderBy,
        take: 5,
      }),
      params.brand ? prisma.product.findMany({
        where: {
          ...exclude,
          model: { equals: params.model, mode: 'insensitive' },
          brand: { equals: params.brand, mode: 'insensitive' },
          NOT: { name: { equals: params.name, mode: 'insensitive' } },
        },
        select,
        orderBy,
        take: 5,
      }) : Promise.resolve([]),
    ]);
    return { sameNameModel, sameModelBrand };
  }

  static async serviceJobs(productId: string, skip: number, take: number) {
    const where: Prisma.ServiceJobWhereInput = { productId };
    const [items, total] = await Promise.all([
      prisma.serviceJob.findMany({
        where,
        include: serviceJobInclude,
        orderBy: [{ serviceCreatedDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
      prisma.serviceJob.count({ where }),
    ]);
    return { items, total };
  }

  static create(data: Prisma.ProductUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.product.create({ data, include: productActorInclude });
  }

  static update(id: string, data: Prisma.ProductUncheckedUpdateInput, tx: Prisma.TransactionClient) {
    return tx.product.update({ where: { id }, data, include: productActorInclude });
  }

  static findActiveFeatureIconCodes(codes: string[], tx: Prisma.TransactionClient) {
    return tx.pricingCardFeatureIcon.findMany({
      where: { code: { in: codes }, isActive: true },
      select: { code: true },
    });
  }

  static async replacePricingCardFeatures(
    productId: string,
    entries: Array<{ iconCode: string; label: string | null; value: string | null; position: number }>,
    tx: Prisma.TransactionClient
  ) {
    await tx.productPricingCardFeature.deleteMany({ where: { productId } });
    if (entries.length) await tx.productPricingCardFeature.createMany({
      data: entries.map((entry) => ({ productId, ...entry })),
    });
  }

  static findActiveDefaultPricingPreset(tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).pricingPreset.findFirst({ where: { isDefault: true, isActive: true, archivedAt: null } });
  }

  /** Resolves either a validated per-print override or the configured defaults. */
  static async findLabelSecretConfiguration(pricingPresetId?: string | null, encodingPresetId?: string | null, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    const settings = await client.labelSecretSettings.findFirst({ include: { defaultPricingPreset: true, defaultEncodingPreset: true } });
    if (!settings?.showCodeOnLabel) return { settings, pricingPreset: null, encodingPreset: null };
    const selectedPricingPresetId = pricingPresetId ?? settings.defaultPricingPresetId;
    const selectedEncodingPresetId = encodingPresetId ?? settings.defaultEncodingPresetId;
    const pricingPreset = selectedPricingPresetId
      ? await client.pricingPreset.findFirst({ where: { id: selectedPricingPresetId, isLabelSecretAllowed: true, isActive: true, archivedAt: null } })
      : null;
    const encodingPreset = selectedEncodingPresetId
      ? await client.labelSecretEncodingPreset.findFirst({ where: { id: selectedEncodingPresetId, isActive: true } })
      : null;
    return { settings, pricingPreset, encodingPreset };
  }

  static findPricingPreset(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).pricingPreset.findUnique({ where: { id } });
  }

  /** The only query that loads image bytes. */
  static findImageBytes(productId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).productImage.findUnique({
      where: { productId },
      select: { data: true, mimeType: true, byteSize: true, updatedAt: true },
    });
  }

  static upsertImage(
    productId: string,
    image: { data: Buffer; mimeType: string; byteSize: number },
    tx: Prisma.TransactionClient
  ) {
    return tx.productImage.upsert({
      where: { productId },
      create: { productId, ...image },
      update: image,
      select: { mimeType: true, byteSize: true, updatedAt: true },
    });
  }

  static async deleteImage(productId: string, tx: Prisma.TransactionClient) {
    await tx.productImage.deleteMany({ where: { productId } });
  }
}
