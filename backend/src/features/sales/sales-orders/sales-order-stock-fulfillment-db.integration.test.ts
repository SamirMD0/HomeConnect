import { Prisma, PrismaClient, StockMovementType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';

const runDatabaseTests =
  process.env.RUN_SALES_FULFILLMENT_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('sales-order stock fulfillment database contract', () => {
  it('enforces active-line idempotency, reversal coherence, and restrictive history links', async () => {
    const prisma = new PrismaClient();
    const userId = randomUUID();
    const productId = randomUUID();
    const orderId = randomUUID();
    const firstItemId = randomUUID();
    const secondItemId = randomUUID();
    const firstMovementId = randomUUID();
    const duplicateMovementId = randomUUID();
    const reversalMovementId = randomUUID();
    const invalidMovementId = randomUUID();

    try {
      await prisma.user.create({
        data: {
          id: userId,
          username: `fulfillment-db-${userId}`,
          password: 'not-used',
          fullName: 'Fulfillment DB Contract User',
          role: 'ADMIN',
        },
      });
      await prisma.product.create({
        data: {
          id: productId,
          sku: `HC-FUL-${productId}`,
          name: 'Fulfillment DB Contract Product',
          model: 'FUL-1',
          trackStock: true,
          stockQuantity: 5,
          createdById: userId,
        },
      });
      await prisma.salesOrder.create({
        data: {
          id: orderId,
          orderNumber: `SO-FUL-${orderId}`,
          salesChannel: 'SHOP_DIRECT',
          orderDate: new Date('2026-08-13T00:00:00.000Z'),
          fulfillmentStatus: 'CONFIRMED',
          itemsSubtotal: '2.00',
          totalAmount: '2.00',
          remainingAmount: '2.00',
          createdById: userId,
        },
      });
      await prisma.salesOrderItem.createMany({
        data: [firstItemId, secondItemId].map((id) => ({
          id,
          salesOrderId: orderId,
          productId,
          productNameSnapshot: 'Fulfillment DB Contract Product',
          productModelSnapshot: 'FUL-1',
          skuSnapshot: `HC-FUL-${productId}`,
          quantity: 1,
          unitPrice: '1.00',
          lineTotal: '1.00',
        })),
      });
      await prisma.stockMovement.createMany({
        data: [
          { id: firstMovementId, movementType: StockMovementType.SALE_FULFILLMENT, quantityChange: -1, quantityBefore: 5, quantityAfter: 4 },
          { id: duplicateMovementId, movementType: StockMovementType.SALE_FULFILLMENT, quantityChange: -1, quantityBefore: 4, quantityAfter: 3 },
          { id: reversalMovementId, movementType: StockMovementType.SALE_CANCEL_RESTORE, quantityChange: 1, quantityBefore: 4, quantityAfter: 5 },
          { id: invalidMovementId, movementType: StockMovementType.SALE_FULFILLMENT, quantityChange: -1, quantityBefore: 5, quantityAfter: 4 },
        ].map((movement) => ({
          ...movement,
          productId,
          reason: 'Database contract probe',
          createdById: userId,
        })),
      });

      const first = await prisma.salesOrderStockFulfillment.create({
        data: {
          salesOrderId: orderId,
          salesOrderItemId: firstItemId,
          productId,
          quantity: 1,
          stockMovementId: firstMovementId,
          createdById: userId,
        },
      });

      let duplicateError: Prisma.PrismaClientKnownRequestError | null = null;
      try {
        await prisma.salesOrderStockFulfillment.create({
          data: {
            salesOrderId: orderId,
            salesOrderItemId: firstItemId,
            productId,
            quantity: 1,
            stockMovementId: duplicateMovementId,
            createdById: userId,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) duplicateError = error;
        else throw error;
      }

      expect(duplicateError?.code).toBe('P2002');
      expect(duplicateError?.meta).toMatchObject({
        modelName: 'SalesOrderStockFulfillment',
        target: ['salesOrderItemId'],
      });

      await expect(prisma.salesOrderStockFulfillment.create({
        data: {
          salesOrderId: orderId,
          salesOrderItemId: secondItemId,
          productId,
          quantity: 0,
          stockMovementId: invalidMovementId,
          createdById: userId,
        },
      })).rejects.toThrow();

      await expect(prisma.salesOrderStockFulfillment.update({
        where: { id: first.id },
        data: { status: 'REVERSED' },
      })).rejects.toThrow();

      await expect(prisma.salesOrderItem.delete({ where: { id: firstItemId } })).rejects.toThrow();

      await prisma.salesOrderStockFulfillment.update({
        where: { id: first.id },
        data: {
          status: 'REVERSED',
          reversalStockMovementId: reversalMovementId,
          reversedAt: new Date('2026-08-13T12:00:00.000Z'),
          reversedById: userId,
          reversalReason: 'Customer changed the order',
        },
      });

      const rededucted = await prisma.salesOrderStockFulfillment.create({
        data: {
          salesOrderId: orderId,
          salesOrderItemId: firstItemId,
          productId,
          quantity: 1,
          stockMovementId: duplicateMovementId,
          createdById: userId,
        },
      });
      expect(rededucted.status).toBe('ACTIVE');

      const constraints = await prisma.$queryRaw<Array<{
        name: string;
        type: string;
        deleteAction: string;
      }>>`
        SELECT conname AS name, contype::text AS type, confdeltype::text AS "deleteAction"
        FROM pg_constraint
        WHERE conrelid = 'sales_order_stock_fulfillments'::regclass
      `;
      expect(constraints.filter((constraint) => constraint.type === 'c').map((constraint) => constraint.name))
        .toEqual(expect.arrayContaining([
          'sales_order_stock_fulfillments_positive_quantity_check',
          'sales_order_stock_fulfillments_reversal_coherent_check',
          'sales_order_stock_fulfillments_reversal_reason_nonempty_check',
        ]));
      expect(constraints.filter((constraint) => constraint.type === 'f')).toHaveLength(7);
      expect(constraints.filter((constraint) => constraint.type === 'f').every(
        (constraint) => constraint.deleteAction === 'r'
      )).toBe(true);

      const indexes = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT indexname AS name
        FROM pg_indexes
        WHERE tablename = 'sales_order_stock_fulfillments'
      `;
      expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining([
        'sales_order_stock_fulfillments_stockMovementId_key',
        'sales_order_stock_fulfillments_reversalStockMovementId_key',
        'sales_order_stock_fulfillments_salesOrderId_idx',
        'sales_order_stock_fulfillments_productId_createdAt_idx',
        'sales_order_stock_fulfillments_status_idx',
        'sales_order_stock_fulfillments_one_active_per_item',
      ]));
    } finally {
      await prisma.salesOrderStockFulfillment.deleteMany({ where: { salesOrderId: orderId } });
      await prisma.stockMovement.deleteMany({ where: { productId } });
      await prisma.salesOrderItem.deleteMany({ where: { salesOrderId: orderId } });
      await prisma.salesOrder.deleteMany({ where: { id: orderId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  }, 30_000);
});
