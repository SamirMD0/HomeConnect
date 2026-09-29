import { Prisma, PrismaClient, StockMovementType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { SupplierReceivingsService } from './receiving/supplier-receivings.service';
import { SupplierReceivingsRepository } from './receiving/supplier-receivings.repository';

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
      // Named rather than counted. A bare `toHaveLength(n)` breaks every time the
      // schema legitimately grows — it already did once, when v1.9.6 added the
      // receiving-correction columns (voidedById, reversedById,
      // reversalStockMovementId) and took the count from 5 to 8.
      //
      // What actually matters is that these specific links exist and that every
      // foreign key on both tables is RESTRICT, so a delete can never orphan
      // posted receiving history.
      const foreignKeys = constraints.filter((constraint) => constraint.type === 'f');
      expect(foreignKeys.map((constraint) => constraint.name)).toEqual(expect.arrayContaining([
        'supplier_receivings_supplierId_fkey',
        'supplier_receivings_receivedById_fkey',
        'supplier_receiving_items_receivingId_fkey',
        'supplier_receiving_items_productId_fkey',
        'supplier_receiving_items_stockMovementId_fkey',
      ]));
      expect(foreignKeys.every((constraint) => constraint.deleteAction === 'r')).toBe(true);

      const indexes = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT indexname AS name
        FROM pg_indexes
        WHERE tablename IN ('supplier_receivings', 'supplier_receiving_items')
      `;
      expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining([
        'supplier_receivings_idempotencyKey_key',
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

  it('replays the original receiving without duplicate stock and rejects key reuse for a different payload', async () => {
    const prisma = new PrismaClient();
    const userId = randomUUID();
    const supplierId = randomUUID();
    const firstProductId = randomUUID();
    const secondProductId = randomUUID();
    const businessDate = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `receiving-${randomUUID()}`;
    const concurrentKey = `receiving-${randomUUID()}`;
    const user = { userId, role: 'EMPLOYEE' as const };
    const input = {
      idempotencyKey,
      supplierId,
      referenceNumber: 'IDEMPOTENCY-RECEIVING-1',
      note: 'Idempotency database contract',
      receivedOn: businessDate,
      items: [{ productId: firstProductId, quantity: 2 }],
    };

    process.env.BUSINESS_TIMEZONE = 'Asia/Beirut';
    try {
      await prisma.user.create({
        data: { id: userId, username: `receiving-idem-${userId}`, password: 'not-used', fullName: 'Receiving Idempotency User', role: 'EMPLOYEE' },
      });
      await prisma.supplier.create({
        data: { id: supplierId, name: 'Receiving Idempotency Supplier', phone: `recv-idem-${supplierId}`, createdById: userId },
      });
      await prisma.product.createMany({
        data: [firstProductId, secondProductId].map((id, index) => ({
          id,
          sku: `HC-RECV-IDEM-${id}`,
          name: `Receiving Idempotency Product ${index + 1}`,
          model: `RECV-IDEM-${index + 1}`,
          trackStock: true,
          stockQuantity: 0,
          createdById: userId,
        })),
      });
      await prisma.stockMovement.createMany({
        data: [firstProductId, secondProductId].map((productId) => ({
          productId,
          movementType: StockMovementType.OPENING_BALANCE,
          quantityChange: 0,
          quantityBefore: 0,
          quantityAfter: 0,
          reason: 'Verified zero opening count',
          createdById: userId,
        })),
      });

      const original = await SupplierReceivingsService.create(input, user);
      const replay = await SupplierReceivingsService.create(input, user);
      expect(replay.id).toBe(original.id);
      expect(await prisma.supplierReceiving.count({ where: { idempotencyKey } })).toBe(1);
      expect(await prisma.stockMovement.count({
        where: { productId: firstProductId, movementType: StockMovementType.PURCHASE_RECEIPT },
      })).toBe(1);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: firstProductId } })).stockQuantity).toBe(2);

      await expect(SupplierReceivingsService.create(
        { ...input, items: [{ productId: firstProductId, quantity: 3 }] },
        user
      )).rejects.toMatchObject({ statusCode: 409, code: 'PAYMENT_IDEMPOTENCY_CONFLICT' });

      const withoutKey = await SupplierReceivingsService.create(
        { ...input, idempotencyKey: null, referenceNumber: 'NO-KEY', items: [{ productId: firstProductId, quantity: 1 }] },
        user
      );
      expect(withoutKey.id).not.toBe(original.id);

      const concurrentInput = {
        ...input,
        idempotencyKey: concurrentKey,
        referenceNumber: 'CONCURRENT',
        items: [{ productId: secondProductId, quantity: 1 }],
      };
      const repository = SupplierReceivingsRepository as unknown as {
        findByIdempotencyKey: (tx: Prisma.TransactionClient, key: string) => Promise<unknown>;
      };
      const originalLookup = repository.findByIdempotencyKey;
      let lookupCount = 0;
      let releaseLookups: () => void = () => undefined;
      const bothLookupsReached = new Promise<void>((resolve) => { releaseLookups = resolve; });
      const lookupSpy = vi.spyOn(repository, 'findByIdempotencyKey')
        .mockImplementation(async (tx, key) => {
          const result = await originalLookup(tx, key);
          lookupCount += 1;
          if (lookupCount === 2) releaseLookups();
          await bothLookupsReached;
          return result;
        });
      const concurrent = await Promise.allSettled([
        SupplierReceivingsService.create(concurrentInput, user),
        SupplierReceivingsService.create(concurrentInput, user),
      ]);
      lookupSpy.mockRestore();
      expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma.supplierReceiving.count({ where: { idempotencyKey: concurrentKey } })).toBe(1);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: secondProductId } })).stockQuantity).toBe(1);
    } finally {
      const receivingIds = (await prisma.supplierReceiving.findMany({ where: { supplierId }, select: { id: true } })).map(({ id }) => id);
      await prisma.supplierReceivingAudit.deleteMany({ where: { receivingId: { in: receivingIds } } });
      await prisma.supplierReceivingItem.deleteMany({ where: { receivingId: { in: receivingIds } } });
      await prisma.supplierReceiving.deleteMany({ where: { id: { in: receivingIds } } });
      await prisma.stockMovement.deleteMany({ where: { productId: { in: [firstProductId, secondProductId] } } });
      await prisma.product.deleteMany({ where: { id: { in: [firstProductId, secondProductId] } } });
      await prisma.supplier.deleteMany({ where: { id: supplierId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  }, 60_000);
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
