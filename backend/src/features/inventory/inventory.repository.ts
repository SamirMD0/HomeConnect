import { Prisma, StockMovementType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getBusinessTimezone } from '../financial/domain/business-date';
import { LowStockListInput, MovementListInput, StockIntegrityItem } from './inventory.types';

const legacyMovementInclude = {
  product: { select: { id: true, sku: true, name: true, trackStock: true, stockQuantity: true } },
  createdBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.StockMovementInclude;

const movementInclude = {
  ...legacyMovementInclude,
  salesFulfillmentMovement: {
    select: { salesOrder: { select: { id: true, orderNumber: true } } },
  },
  salesFulfillmentReversalMovement: {
    select: { salesOrder: { select: { id: true, orderNumber: true } } },
  },
} satisfies Prisma.StockMovementInclude;

const inventoryProductSelect = {
  id: true,
  sku: true,
  name: true,
  isActive: true,
  trackStock: true,
  stockQuantity: true,
  lowStockThreshold: true,
} satisfies Prisma.ProductSelect;

export interface CreateMovementData {
  productId: string;
  movementType: StockMovementType;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  note: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdById: string | null;
}

interface IntegrityRow {
  productId: string;
  sku: string;
  name: string;
  trackStock: boolean;
  stockQuantity: number;
  ledgerSum: bigint;
  movementCount: bigint;
  hasOpeningBalance: boolean;
  lastQuantityAfter: number | null;
}

export function classifyStockIntegrity(row: {
  trackStock: boolean;
  stockQuantity: number;
  movementCount: number;
  ledgerSum: number;
  hasOpeningBalance: boolean;
  lastQuantityAfter: number | null;
}) {
  if (row.movementCount === 0) {
    return !row.trackStock && row.stockQuantity === 0 ? 'NOT_IN_INVENTORY' as const : 'PENDING_ONBOARDING' as const;
  }
  return row.hasOpeningBalance
    && row.ledgerSum === row.stockQuantity
    && row.lastQuantityAfter === row.stockQuantity
    ? 'OK' as const
    : 'MISMATCH' as const;
}

export class InventoryRepository {
  static findProduct(productId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).product.findUnique({
      where: { id: productId },
      select: inventoryProductSelect,
    });
  }

  static hasOpeningBalance(productId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).stockMovement.findFirst({
      where: { productId, movementType: StockMovementType.OPENING_BALANCE },
      select: { id: true },
    });
  }

  static findOpeningBalance(productId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).stockMovement.findFirst({
      where: { productId, movementType: StockMovementType.OPENING_BALANCE },
      select: { id: true, createdAt: true },
    });
  }

  static compareAndSetQuantity(
    productId: string,
    quantityBefore: number,
    quantityAfter: number,
    tx: Prisma.TransactionClient
  ) {
    return tx.product.updateMany({
      where: { id: productId, trackStock: true, stockQuantity: quantityBefore },
      data: { stockQuantity: quantityAfter },
    });
  }

  static setVerifiedOpeningCount(
    productId: string,
    verifiedCount: number,
    updatedById: string,
    tx: Prisma.TransactionClient
  ) {
    return tx.product.update({
      where: { id: productId },
      data: { trackStock: true, stockQuantity: verifiedCount, updatedById },
      select: inventoryProductSelect,
    });
  }

  /** Append-only by construction: this repository exposes create, never update or delete. */
  static createMovement(data: CreateMovementData, tx: Prisma.TransactionClient) {
    return tx.stockMovement.create({ data, include: movementInclude });
  }

  static async listMovements(input: MovementListInput = {}) {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const where: Prisma.StockMovementWhereInput = {
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.movementType ? { movementType: input.movementType } : {}),
      ...(input.createdById ? { createdById: input.createdById } : {}),
      ...(input.from || input.to
        ? { createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.stockMovement.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  static async listLowStock(input: LowStockListInput = {}) {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const search = input.search?.trim() ?? '';
    const pattern = `%${search}%`;
    const rows = await prisma.$queryRaw<Array<{
      id: string;
      sku: string;
      name: string;
      barcode: string | null;
      stockQuantity: number;
      lowStockThreshold: number;
      total: bigint;
    }>>(Prisma.sql`
      SELECT p."id", p."sku", p."name", p."barcode", p."stockQuantity", p."lowStockThreshold",
             COUNT(*) OVER() AS "total"
      FROM "products" p
      WHERE p."trackStock" = true
        AND (
          p."stockQuantity" = 0
          OR (p."lowStockThreshold" IS NOT NULL AND p."stockQuantity" <= p."lowStockThreshold")
        )
        AND (${search} = '' OR p."name" ILIKE ${pattern} OR p."sku" ILIKE ${pattern} OR COALESCE(p."barcode", '') ILIKE ${pattern})
      ORDER BY p."stockQuantity" ASC, p."name" ASC, p."id" ASC
      OFFSET ${(page - 1) * pageSize}
      LIMIT ${pageSize}
    `);
    return {
      items: rows.map(({ total: _total, ...row }) => ({
        ...row,
        stockStatus: row.stockQuantity === 0 ? 'OUT_OF_STOCK' as const : 'LOW_STOCK' as const,
      })),
      total: Number(rows[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  static async summary() {
    // The packaged app must start on the old schema so Maintenance can take a backup before
    // applying pending migrations. Keep the existing dashboard usable during that short window.
    const fulfillmentTableExists = await this.salesOrderStockFulfillmentTableExists();
    const [counts, recentMovements, awaitingOrderIds] = await Promise.all([
      prisma.$queryRaw<Array<{
        trackedProducts: bigint;
        lowStockProducts: bigint;
        outOfStockProducts: bigint;
        totalUnits: bigint;
        movementsToday: bigint;
      }>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE p."trackStock") AS "trackedProducts",
          COUNT(*) FILTER (
            WHERE p."trackStock" AND p."stockQuantity" > 0
              AND p."lowStockThreshold" IS NOT NULL
              AND p."stockQuantity" <= p."lowStockThreshold"
          ) AS "lowStockProducts",
          COUNT(*) FILTER (WHERE p."trackStock" AND p."stockQuantity" = 0) AS "outOfStockProducts",
          COALESCE(SUM(p."stockQuantity") FILTER (WHERE p."trackStock"), 0) AS "totalUnits",
          (SELECT COUNT(*) FROM "stock_movements" m WHERE m."createdAt" >= date_trunc('day', CURRENT_TIMESTAMP)) AS "movementsToday"
        FROM "products" p
      `),
      fulfillmentTableExists
        ? prisma.stockMovement.findMany({ include: movementInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10 })
        : prisma.stockMovement.findMany({ include: legacyMovementInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10 }),
      fulfillmentTableExists ? this.querySalesOrderIdsAwaitingStockDeduction() : Promise.resolve([]),
    ]);
    const count = counts[0];
    return {
      trackedProducts: Number(count?.trackedProducts ?? 0),
      lowStockProducts: Number(count?.lowStockProducts ?? 0),
      outOfStockProducts: Number(count?.outOfStockProducts ?? 0),
      totalUnits: Number(count?.totalUnits ?? 0),
      movementsToday: Number(count?.movementsToday ?? 0),
      ordersAwaitingStockDeduction: awaitingOrderIds.length,
      recentMovements,
    };
  }

  static async salesOrderIdsAwaitingStockDeduction(): Promise<string[]> {
    if (!(await this.salesOrderStockFulfillmentTableExists())) return [];
    return this.querySalesOrderIdsAwaitingStockDeduction();
  }

  private static async salesOrderStockFulfillmentTableExists(): Promise<boolean> {
    const [result] = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
      SELECT to_regclass('public.sales_order_stock_fulfillments') IS NOT NULL AS "exists"
    `);
    return result?.exists ?? false;
  }

  private static async querySalesOrderIdsAwaitingStockDeduction(): Promise<string[]> {
    const timezone = getBusinessTimezone();
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT DISTINCT o."id"
      FROM "sales_orders" o
      JOIN "sales_order_items" i ON i."salesOrderId" = o."id"
      JOIN "products" p ON p."id" = i."productId"
      JOIN "stock_movements" opening
        ON opening."productId" = p."id"
       AND opening."movementType" = 'OPENING_BALANCE'
      WHERE o."fulfillmentStatus"::text IN (
        'CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED'
      )
        AND p."trackStock" = true
        AND p."stockQuantity" >= i."quantity"
        AND o."orderDate" >= (opening."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date
        AND NOT EXISTS (
          SELECT 1
          FROM "sales_order_stock_fulfillments" f
          WHERE f."salesOrderItemId" = i."id" AND f."status" = 'ACTIVE'
        )
      ORDER BY o."id"
    `);
    return rows.map((row) => row.id);
  }

  static async stockIntegrity(): Promise<StockIntegrityItem[]> {
    const rows = await prisma.$queryRaw<IntegrityRow[]>(Prisma.sql`
      WITH ledger AS (
        SELECT
          p."id" AS "productId",
          COUNT(m."id") AS "movementCount",
          COALESCE(SUM(m."quantityChange"), 0) AS "ledgerSum",
          BOOL_OR(m."movementType" = 'OPENING_BALANCE') AS "hasOpeningBalance"
        FROM "products" p
        LEFT JOIN "stock_movements" m ON m."productId" = p."id"
        GROUP BY p."id"
      ),
      latest AS (
        SELECT DISTINCT ON (m."productId") m."productId", m."quantityAfter" AS "lastQuantityAfter"
        FROM "stock_movements" m
        ORDER BY m."productId", m."createdAt" DESC, m."id" DESC
      )
      SELECT
        p."id" AS "productId", p."sku", p."name", p."trackStock", p."stockQuantity",
        l."ledgerSum", l."movementCount", COALESCE(l."hasOpeningBalance", false) AS "hasOpeningBalance",
        latest."lastQuantityAfter"
      FROM "products" p
      JOIN ledger l ON l."productId" = p."id"
      LEFT JOIN latest ON latest."productId" = p."id"
      ORDER BY p."name" ASC, p."id" ASC
    `);

    return rows.map((row) => {
      const movementCount = Number(row.movementCount);
      const ledgerSum = Number(row.ledgerSum);
      const status = classifyStockIntegrity({ ...row, movementCount, ledgerSum });
      return { ...row, movementCount, ledgerSum, status };
    });
  }
}
