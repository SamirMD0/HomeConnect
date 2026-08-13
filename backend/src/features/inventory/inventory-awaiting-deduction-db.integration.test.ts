import { PrismaClient, StockMovementType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { InventoryRepository } from './inventory.repository';

const runDatabaseTests =
  process.env.RUN_SALES_FULFILLMENT_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('orders awaiting stock deduction database query', () => {
  it('uses the Beirut business date for a UTC-naive opening-count timestamp', async () => {
    const prisma = new PrismaClient();
    const userId = randomUUID();
    const productId = randomUUID();
    const openingMovementId = randomUUID();
    const previousDayOrderId = randomUUID();
    const openingDayOrderId = randomUUID();

    try {
      await prisma.user.create({
        data: {
          id: userId,
          username: `awaiting-stock-${userId}`,
          password: 'not-used',
          fullName: 'Awaiting Stock DB Test User',
          role: 'ADMIN',
        },
      });
      await prisma.product.create({
        data: {
          id: productId,
          sku: `HC-AWAIT-${productId}`,
          name: 'Awaiting Stock Boundary Product',
          model: 'AWAIT-1',
          trackStock: true,
          stockQuantity: 10,
          createdById: userId,
        },
      });
      await prisma.stockMovement.create({
        data: {
          id: openingMovementId,
          productId,
          movementType: StockMovementType.OPENING_BALANCE,
          quantityChange: 10,
          quantityBefore: 0,
          quantityAfter: 10,
          reason: 'Opening count just after Beirut midnight',
          createdById: userId,
          // 2026-08-13 01:30 in Beirut, stored in this Prisma timestamp column as UTC-naive.
          createdAt: new Date('2026-08-12T22:30:00.000Z'),
        },
      });

      await prisma.salesOrder.createMany({
        data: [
          { id: previousDayOrderId, orderNumber: `SO-AWAIT-PREV-${previousDayOrderId}`, orderDate: new Date('2026-08-12T00:00:00.000Z') },
          { id: openingDayOrderId, orderNumber: `SO-AWAIT-SAME-${openingDayOrderId}`, orderDate: new Date('2026-08-13T00:00:00.000Z') },
        ].map((order) => ({
          ...order,
          salesChannel: 'SHOP_DIRECT' as const,
          fulfillmentStatus: 'CONFIRMED' as const,
          itemsSubtotal: '1.00',
          totalAmount: '1.00',
          remainingAmount: '1.00',
          createdById: userId,
        })),
      });
      await prisma.salesOrderItem.createMany({
        data: [previousDayOrderId, openingDayOrderId].map((salesOrderId) => ({
          id: randomUUID(),
          salesOrderId,
          productId,
          productNameSnapshot: 'Awaiting Stock Boundary Product',
          productModelSnapshot: 'AWAIT-1',
          skuSnapshot: `HC-AWAIT-${productId}`,
          quantity: 1,
          unitPrice: '1.00',
          lineTotal: '1.00',
        })),
      });

      const ids = await InventoryRepository.salesOrderIdsAwaitingStockDeduction();
      expect(ids).not.toContain(previousDayOrderId);
      expect(ids).toContain(openingDayOrderId);
    } finally {
      await prisma.salesOrderItem.deleteMany({
        where: { salesOrderId: { in: [previousDayOrderId, openingDayOrderId] } },
      });
      await prisma.salesOrder.deleteMany({
        where: { id: { in: [previousDayOrderId, openingDayOrderId] } },
      });
      await prisma.stockMovement.deleteMany({ where: { id: openingMovementId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  }, 30_000);
});
