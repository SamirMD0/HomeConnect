import { Prisma, PrismaClient, Role, StockMovementType, SupplierTransactionType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { SupplierPurchasesService } from './supplier-purchases.service';
import { SupplierPurchasesRepository } from './supplier-purchases.repository';

/**
 * Proves the v1.9.4 constraints actually bite in PostgreSQL rather than only in
 * the service layer. Opt-in, and never against the business database:
 *
 *   RUN_SUPPLIER_PURCHASE_DB_TESTS=1 DATABASE_URL=<scratch db> npx vitest run <this file>
 */
const runDatabaseTests =
  process.env.RUN_SUPPLIER_PURCHASE_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('supplier purchase database contract', () => {
  it('enforces line shape, receiving-link uniqueness, and the override reason rule', async () => {
    const prisma = new PrismaClient();
    const userId = randomUUID();
    const supplierId = randomUUID();
    const productId = randomUUID();
    const movementId = randomUUID();
    const receivingId = randomUUID();
    const receivingItemId = randomUUID();
    const debtId = randomUUID();

    const seed = async () => {
      await prisma.user.create({ data: { id: userId, username: `purchase-db-${userId}`, password: 'not-used', fullName: 'Purchase DB Contract User', role: 'ADMIN' } });
      await prisma.supplier.create({ data: { id: supplierId, name: 'Purchase DB Contract Supplier', phone: `pur-${supplierId}`, createdById: userId } });
      await prisma.product.create({ data: { id: productId, sku: `HC-PUR-${productId}`, name: 'Purchase DB Contract Product', model: 'PUR-1', trackStock: true, stockQuantity: 0, createdById: userId } });
      await prisma.stockMovement.create({ data: { id: movementId, productId, movementType: 'PURCHASE_RECEIPT', quantityChange: 2, quantityBefore: 0, quantityAfter: 2, reason: 'Purchase DB contract', createdById: userId } });
      await prisma.supplierReceiving.create({ data: { id: receivingId, supplierId, receivedOn: new Date('2026-08-15T00:00:00.000Z'), receivedById: userId } });
      await prisma.supplierReceivingItem.create({ data: { id: receivingItemId, receivingId, productId, quantity: 2, stockMovementId: movementId } });
      await prisma.supplierTransaction.create({ data: { id: debtId, supplierId, supplierReceivingId: receivingId, type: 'SUPPLIER_DEBT', direction: 'INCREASE_OWED', amount: '420.00', transactionDate: new Date('2026-08-15T00:00:00.000Z'), description: 'Purchase DB contract', receiptNumber: 'INV-DBTEST', createdById: userId } });
    };

    const line = (overrides: Record<string, unknown>) => prisma.supplierPurchaseLine.create({
      data: {
        id: randomUUID(), supplierTransactionId: debtId, kind: 'PRODUCT', productId,
        description: 'Purchase DB Contract Product', quantity: 2, unitPrice: '210.00', lineTotal: '420.00',
        position: 0, ...overrides,
      } as never,
    });

    try {
      await seed();

      // A product line linked to the receiving item that moved the stock.
      await expect(line({ receivingItemId })).resolves.toBeTruthy();

      // The same receiving item may never be billed twice.
      await expect(line({ id: randomUUID(), receivingItemId, position: 1 })).rejects.toThrow();

      // A manual line carrying a product, quantity, price, or stock link is
      // rejected by the database, not merely by the service.
      await expect(line({ id: randomUUID(), kind: 'MANUAL', position: 2 })).rejects.toThrow();
      await expect(line({ id: randomUUID(), kind: 'MANUAL', productId: null, quantity: null, unitPrice: null, receivingItemId, position: 3 })).rejects.toThrow();
      await expect(line({ id: randomUUID(), kind: 'MANUAL', productId: null, quantity: null, unitPrice: null, receivingItemId: null, description: 'Freight', lineTotal: '25.00', position: 4 })).resolves.toBeTruthy();

      // A product line missing its quantity or price is rejected.
      await expect(line({ id: randomUUID(), quantity: null, position: 5 })).rejects.toThrow();
      await expect(line({ id: randomUUID(), unitPrice: null, position: 6 })).rejects.toThrow();

      // Zero is allowed for bonus stock; negative never is.
      await expect(line({ id: randomUUID(), unitPrice: '0.00', lineTotal: '0.00', position: 7 })).resolves.toBeTruthy();
      await expect(line({ id: randomUUID(), unitPrice: '-1.00', lineTotal: '-2.00', position: 8 })).rejects.toThrow();
      await expect(line({ id: randomUUID(), quantity: 0, position: 9 })).rejects.toThrow();

      // An empty description is not a description.
      await expect(line({ id: randomUUID(), description: '   ', position: 10 })).rejects.toThrow();

      // A hand-set total must state why.
      await expect(prisma.supplierTransaction.update({ where: { id: debtId }, data: { amountOverride: true } })).rejects.toThrow();
      await expect(prisma.supplierTransaction.update({ where: { id: debtId }, data: { amountOverride: true, amountOverrideReason: 'Bulk discount' } })).resolves.toBeTruthy();

      // Receipt numbers are deliberately reusable.
      await expect(prisma.supplierTransaction.create({
        data: { id: randomUUID(), supplierId, type: 'SUPPLIER_DEBT', direction: 'INCREASE_OWED', amount: '10.00', transactionDate: new Date('2026-08-15T00:00:00.000Z'), description: 'Second invoice, same number', receiptNumber: 'INV-DBTEST', createdById: userId },
      })).resolves.toBeTruthy();

      // History stays restrictive: a billed purchase line pins its receiving item.
      await expect(prisma.supplierReceivingItem.delete({ where: { id: receivingItemId } })).rejects.toThrow();
    } finally {
      await prisma.supplierPurchaseLine.deleteMany({ where: { supplierTransactionId: debtId } });
      await prisma.supplierTransaction.deleteMany({ where: { supplierId } });
      await prisma.supplierReceivingItem.deleteMany({ where: { receivingId } });
      await prisma.supplierReceiving.deleteMany({ where: { id: receivingId } });
      await prisma.stockMovement.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.supplier.deleteMany({ where: { id: supplierId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  }, 60_000);

  it('makes the complete purchase command idempotent and keeps no-key callers compatible', async () => {
    const prisma = new PrismaClient();
    const userId = randomUUID();
    const supplierId = randomUUID();
    const productId = randomUUID();
    const businessDate = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `purchase-${randomUUID()}`;
    const concurrentKey = `purchase-${randomUUID()}`;
    const user = { userId, role: Role.ADMIN };
    const context = { requestId: 'purchase-idempotency-db', ipAddress: '127.0.0.1' };
    const input = {
      idempotencyKey,
      receiptNumber: 'IDEMPOTENCY-INV-1',
      transactionDate: businessDate,
      description: 'Idempotent supplier purchase',
      reference: null,
      notes: null,
      receiveStock: true,
      amountOverride: null,
      amountOverrideReason: null,
      paidAmount: null,
      paymentReference: null,
      lines: [{ kind: 'EXISTING_PRODUCT' as const, productId, quantity: 2, unitPrice: '15.00' }],
    };

    process.env.BUSINESS_TIMEZONE = 'Asia/Beirut';
    try {
      await prisma.user.create({
        data: { id: userId, username: `purchase-idem-${userId}`, password: 'not-used', fullName: 'Purchase Idempotency User', role: Role.ADMIN },
      });
      await prisma.supplier.create({
        data: { id: supplierId, name: 'Purchase Idempotency Supplier', phone: `idem-${supplierId}`, createdById: userId },
      });
      await prisma.product.create({
        data: { id: productId, sku: `HC-IDEM-${productId}`, name: 'Purchase Idempotency Product', model: 'IDEM-1', trackStock: true, stockQuantity: 0, createdById: userId },
      });
      await prisma.stockMovement.create({
        data: { productId, movementType: StockMovementType.OPENING_BALANCE, quantityChange: 0, quantityBefore: 0, quantityAfter: 0, reason: 'Verified zero opening count', createdById: userId },
      });

      const original = await SupplierPurchasesService.create(supplierId, input, user, context);
      const replay = await SupplierPurchasesService.create(supplierId, input, user, context);

      expect(replay.id).toBe(original.id);
      expect(await prisma.supplierTransaction.count({
        where: { supplierId, type: SupplierTransactionType.SUPPLIER_DEBT, idempotencyKey },
      })).toBe(1);
      expect(await prisma.supplierReceiving.count({ where: { supplierId, idempotencyKey } })).toBe(1);
      expect(await prisma.stockMovement.count({
        where: { productId, movementType: StockMovementType.PURCHASE_RECEIPT },
      })).toBe(1);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity).toBe(2);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).costPrice?.toFixed(2)).toBe('15.00');
      expect(await prisma.serviceAudit.count({
        where: { recordType: 'PRODUCT', recordId: productId, action: 'CHANGE_PRICE' },
      })).toBe(1);

      await expect(SupplierPurchasesService.create(
        supplierId,
        { ...input, lines: [{ ...input.lines[0], quantity: 3 }] },
        user,
        context
      )).rejects.toMatchObject({ statusCode: 409, code: 'PAYMENT_IDEMPOTENCY_CONFLICT' });

      // The product update and its audit happen before this deliberately late
      // validation. PostgreSQL must roll both back with the rejected purchase.
      const debtCountBeforeFailure = await prisma.supplierTransaction.count({ where: { supplierId } });
      await expect(SupplierPurchasesService.create(
        supplierId,
        {
          ...input,
          idempotencyKey: null,
          receiveStock: false,
          description: 'Deliberate rollback after cost update',
          paidAmount: '999.00',
          lines: [{ ...input.lines[0], unitPrice: '20.00' }],
        },
        user,
        context
      )).rejects.toThrow('Paid amount cannot exceed the purchase total');
      expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).costPrice?.toFixed(2)).toBe('15.00');
      expect(await prisma.serviceAudit.count({
        where: { recordType: 'PRODUCT', recordId: productId, action: 'CHANGE_PRICE' },
      })).toBe(1);
      expect(await prisma.supplierTransaction.count({ where: { supplierId } })).toBe(debtCountBeforeFailure);

      const withoutKey = await SupplierPurchasesService.create(
        supplierId,
        {
          ...input,
          idempotencyKey: null,
          receiveStock: false,
          description: 'Backward-compatible weighted no-key purchase',
          lines: [
            { ...input.lines[0], quantity: 1, unitPrice: '10.00' },
            { ...input.lines[0], quantity: 1, unitPrice: '10.01' },
          ],
        },
        user,
        context
      );
      expect(withoutKey.id).not.toBe(original.id);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).costPrice?.toFixed(2)).toBe('10.01');
      expect(await prisma.serviceAudit.count({
        where: { recordType: 'PRODUCT', recordId: productId, action: 'CHANGE_PRICE' },
      })).toBe(2);

      const concurrentInput = {
        ...input,
        idempotencyKey: concurrentKey,
        receiveStock: false,
        description: 'Concurrent idempotent purchase',
      };
      const repository = SupplierPurchasesRepository as unknown as {
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
        SupplierPurchasesService.create(supplierId, concurrentInput, user, context),
        SupplierPurchasesService.create(supplierId, concurrentInput, user, context),
      ]);
      lookupSpy.mockRestore();
      expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma.supplierTransaction.count({ where: { idempotencyKey: concurrentKey } })).toBe(1);
    } finally {
      const receivingIds = (await prisma.supplierReceiving.findMany({ where: { supplierId }, select: { id: true } })).map(({ id }) => id);
      const transactionIds = (await prisma.supplierTransaction.findMany({ where: { supplierId }, select: { id: true } })).map(({ id }) => id);
      await prisma.supplierAudit.deleteMany({ where: { supplierId } });
      await prisma.serviceAudit.deleteMany({ where: { recordType: 'PRODUCT', recordId: productId } });
      await prisma.supplierPurchaseLine.deleteMany({ where: { supplierTransactionId: { in: transactionIds } } });
      await prisma.supplierTransaction.deleteMany({ where: { id: { in: transactionIds } } });
      await prisma.supplierReceivingItem.deleteMany({ where: { receivingId: { in: receivingIds } } });
      await prisma.supplierReceiving.deleteMany({ where: { id: { in: receivingIds } } });
      await prisma.stockMovement.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.supplier.deleteMany({ where: { id: supplierId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  }, 60_000);
});
