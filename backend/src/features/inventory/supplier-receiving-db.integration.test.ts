import { Prisma, PrismaClient, StockMovementType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';

const runDatabaseTests =
  process.env.RUN_SUPPLIER_RECEIVING_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('supplier receiving database contract', () => {
  it('enforces quantity, uniqueness, and restrictive history constraints without blocking duplicate references', async () => {
    const prisma = new PrismaClient();
    const userId = randomUUID();
    const supplierId = randomUUID();
    const firstProductId = randomUUID();
    const secondProductId = randomUUID();
    const firstReceivingId = randomUUID();
    const secondReceivingId = randomUUID();
    const anonymousReceivingId = randomUUID();
    const movementIds = [randomUUID(), randomUUID(), randomUUID()];

    try {
      await prisma.user.create({
        data: {
          id: userId,
          username: `receiving-db-${userId}`,
          password: 'not-used',
          fullName: 'Receiving DB Contract User',
          role: 'ADMIN',
        },
      });
      await prisma.supplier.create({
        data: {
          id: supplierId,
          name: 'Receiving DB Contract Supplier',
          phone: `recv-${supplierId}`,
          createdById: userId,
        },
      });
      await prisma.product.createMany({
        data: [firstProductId, secondProductId].map((id, index) => ({
          id,
          sku: `HC-RECV-${id}`,
          name: `Receiving DB Contract Product ${index + 1}`,
          model: `RECV-${index + 1}`,
          trackStock: true,
          stockQuantity: 0,
          createdById: userId,
        })),
      });
      await prisma.stockMovement.createMany({
        data: movementIds.map((id, index) => ({
          id,
          productId: index === 2 ? secondProductId : firstProductId,
          movementType: StockMovementType.PURCHASE_RECEIPT,
          quantityChange: 1,
          quantityBefore: index,
          quantityAfter: index + 1,
          reason: 'Supplier receiving database contract probe',
          createdById: userId,
        })),
      });

      await prisma.supplierReceiving.createMany({
        data: [firstReceivingId, secondReceivingId].map((id) => ({
          id,
          supplierId,
          referenceNumber: 'DUPLICATE-REFERENCE-ALLOWED',
          receivedOn: new Date('2026-08-14T00:00:00.000Z'),
          receivedById: userId,
        })),
      });
      await prisma.supplierReceiving.create({
        data: {
          id: anonymousReceivingId,
          supplierId: null,
          referenceNumber: null,
          receivedOn: new Date('2026-08-14T00:00:00.000Z'),
          receivedById: userId,
        },
      });
      await expect(prisma.supplierReceiving.create({
        data: {
          supplierId,
          referenceNumber: '   ',
          receivedOn: new Date('2026-08-14T00:00:00.000Z'),
          receivedById: userId,
        },
      })).rejects.toThrow();

      await prisma.supplierReceivingItem.create({
        data: {
          receivingId: firstReceivingId,
          productId: firstProductId,
          quantity: 1,
          stockMovementId: movementIds[0],
        },
      });

      const duplicateProduct = prisma.supplierReceivingItem.create({
        data: {
          receivingId: firstReceivingId,
          productId: firstProductId,
          quantity: 1,
          stockMovementId: movementIds[1],
        },
      });
      await expectKnownRequest(duplicateProduct, 'P2002');

      const duplicateMovement = prisma.supplierReceivingItem.create({
        data: {
          receivingId: firstReceivingId,
          productId: secondProductId,
          quantity: 1,
          stockMovementId: movementIds[0],
        },
      });
      await expectKnownRequest(duplicateMovement, 'P2002');

      for (const quantity of [0, 100_001]) {
        await expect(prisma.supplierReceivingItem.create({
          data: {
            receivingId: firstReceivingId,
            productId: secondProductId,
            quantity,
            stockMovementId: movementIds[2],
          },
        })).rejects.toThrow();
      }

      await expect(prisma.supplier.delete({ where: { id: supplierId } })).rejects.toThrow();
      await expect(prisma.product.delete({ where: { id: firstProductId } })).rejects.toThrow();
      await expect(prisma.stockMovement.delete({ where: { id: movementIds[0] } })).rejects.toThrow();
      await expect(prisma.supplierReceiving.delete({ where: { id: firstReceivingId } })).rejects.toThrow();

      const constraints = await prisma.$queryRaw<Array<{
        tableName: string;
        name: string;
        type: string;
        deleteAction: string;
      }>>`
        SELECT conrelid::regclass::text AS "tableName", conname AS name,
               contype::text AS type, confdeltype::text AS "deleteAction"
        FROM pg_constraint
        WHERE conrelid IN ('supplier_receivings'::regclass, 'supplier_receiving_items'::regclass)
      `;
      expect(constraints.filter((constraint) => constraint.type === 'c').map((constraint) => constraint.name))
        .toEqual(expect.arrayContaining([
          'supplier_receivings_reference_nonempty_check',
          'supplier_receiving_items_positive_quantity_check',
          'supplier_receiving_items_quantity_limit_check',
        ]));
      expect(constraints.filter((constraint) => constraint.type === 'f')).toHaveLength(5);
      expect(constraints.filter((constraint) => constraint.type === 'f').every(
        (constraint) => constraint.deleteAction === 'r'
      )).toBe(true);

      const indexes = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT indexname AS name
        FROM pg_indexes
        WHERE tablename IN ('supplier_receivings', 'supplier_receiving_items')
      `;
      expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining([
        'supplier_receivings_supplierId_receivedOn_idx',
        'supplier_receivings_receivedOn_idx',
        'supplier_receivings_receivedById_idx',
        'supplier_receiving_items_stockMovementId_key',
        'supplier_receiving_items_receivingId_productId_key',
        'supplier_receiving_items_productId_createdAt_idx',
      ]));
    } finally {
      await prisma.supplierReceivingItem.deleteMany({
        where: { receivingId: { in: [firstReceivingId, secondReceivingId, anonymousReceivingId] } },
      });
      await prisma.supplierReceiving.deleteMany({
        where: { id: { in: [firstReceivingId, secondReceivingId, anonymousReceivingId] } },
      });
      await prisma.stockMovement.deleteMany({ where: { id: { in: movementIds } } });
      await prisma.product.deleteMany({ where: { id: { in: [firstProductId, secondProductId] } } });
      await prisma.supplier.deleteMany({ where: { id: supplierId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  }, 30_000);
});

async function expectKnownRequest(promise: Promise<unknown>, code: string): Promise<void> {
  let caught: Prisma.PrismaClientKnownRequestError | null = null;
  try {
    await promise;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) caught = error;
    else throw error;
  }
  expect(caught?.code).toBe(code);
}
