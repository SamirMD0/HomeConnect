import { Role, StockMovementType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { describe, expect, it } from 'vitest';

config({ path: 'backend/.env' });

const runDatabaseTests = process.env.RUN_INVENTORY_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('batch inventory onboarding database contract', () => {
  it('paginates the worklist, writes 100 rows atomically, preserves skips, and prevents concurrent duplicates', async () => {
    const [{ prisma }, { InventoryService }, { InventoryRepository }, { ProductsRepository }] = await Promise.all([
      import('../../lib/prisma.js'),
      import('./inventory.service.js'),
      import('./inventory.repository.js'),
      import('../service/products/products.repository.js'),
    ]);
    const adminId = randomUUID();
    const scaleProducts = Array.from({ length: 100 }, (_, index) => ({
      id: randomUUID(),
      sku: `HC-RW3-${String(index).padStart(3, '0')}-${adminId.slice(0, 6)}`,
      name: `CPRW3 Scale ${String(index).padStart(3, '0')}`,
      model: `RW3-${index}`,
      brand: index % 2 === 0 ? 'Batch Brand' : null,
      barcode: `RW3${adminId.slice(0, 6)}${String(index).padStart(3, '0')}`,
      trackStock: false,
      stockQuantity: 0,
      createdById: adminId,
    }));
    const overlapId = randomUUID();
    const alreadyId = randomUUID();
    const archivedId = randomUUID();
    const allProductIds = [...scaleProducts.map((product) => product.id), overlapId, alreadyId, archivedId];

    try {
      await prisma.user.create({
        data: {
          id: adminId,
          username: `rw3-admin-${adminId}`,
          password: 'unused-for-batch-onboarding',
          fullName: 'RW3 Integration Admin',
          role: Role.ADMIN,
        },
      });
      await prisma.product.createMany({
        data: [
          ...scaleProducts,
          { id: overlapId, sku: `HC-RW3-OVERLAP-${adminId.slice(0, 6)}`, name: 'CPRW3 Overlap', model: 'RW3-OVERLAP', createdById: adminId },
          { id: alreadyId, sku: `HC-RW3-ALREADY-${adminId.slice(0, 6)}`, name: 'CPRW3 Already', model: 'RW3-ALREADY', trackStock: true, stockQuantity: 9, createdById: adminId },
          { id: archivedId, sku: `HC-RW3-ARCHIVE-${adminId.slice(0, 6)}`, name: 'CPRW3 Archived', model: 'RW3-ARCHIVE', isActive: false, createdById: adminId },
        ],
      });
      await prisma.stockMovement.create({
        data: {
          productId: alreadyId, movementType: StockMovementType.OPENING_BALANCE,
          quantityChange: 9, quantityBefore: 0, quantityAfter: 9,
          reason: 'Existing opening balance', createdById: adminId,
        },
      });

      const firstPage = await InventoryRepository.listPendingOnboarding({ search: 'CPRW3', page: 1, pageSize: 50 });
      const secondPage = await InventoryRepository.listPendingOnboarding({ search: 'CPRW3', page: 2, pageSize: 50 });
      expect(firstPage.total).toBe(101);
      expect(firstPage.items).toHaveLength(50);
      expect(secondPage.items).toHaveLength(50);
      expect([...firstPage.items, ...secondPage.items].every((item) => item.productId !== archivedId)).toBe(true);
      const withArchived = await InventoryRepository.listPendingOnboarding({ search: 'CPRW3 Archived', includeArchived: true });
      expect(withArchived.items).toEqual([expect.objectContaining({ productId: archivedId })]);

      const untrackedBefore = await ProductsRepository.list({
        isActive: true, trackStock: false, sortBy: 'name', sortOrder: 'asc', skip: 0, take: 100,
      });
      expect(untrackedBefore.items.some((product) => product.id === scaleProducts[0].id)).toBe(true);

      const startedAt = Date.now();
      const scaleResult = await InventoryService.batchVerifyOpeningCount({
        items: scaleProducts.map((product, index) => ({ productId: product.id, openingCount: index === 0 ? 0 : index })),
      }, { userId: adminId, role: Role.ADMIN });
      expect(Date.now() - startedAt).toBeLessThan(5_000);
      expect(scaleResult).toMatchObject({ dryRun: false, counts: { written: 100, skipped: 0 } });
      if (scaleResult.dryRun) throw new Error('Expected a write result');
      expect(await prisma.stockMovement.count({
        where: { productId: { in: scaleProducts.map((product) => product.id) }, movementType: StockMovementType.OPENING_BALANCE },
      })).toBe(100);
      const movements = await prisma.stockMovement.findMany({
        where: { productId: { in: scaleProducts.map((product) => product.id) } },
        select: { productId: true, quantityBefore: true, quantityAfter: true, referenceId: true, referenceType: true, reason: true, createdById: true },
      });
      expect(new Set(movements.map((movement) => movement.referenceId))).toEqual(new Set([scaleResult.batchId]));
      expect(movements.every((movement) => movement.quantityBefore === 0 && movement.referenceType === 'MANUAL_BATCH'
        && movement.reason === 'Initial shop-floor stock count / جرد افتتاحي' && movement.createdById === adminId)).toBe(true);
      const updatedProducts = await prisma.product.findMany({
        where: { id: { in: scaleProducts.map((product) => product.id) } },
        select: { id: true, trackStock: true, stockQuantity: true },
      });
      expect(updatedProducts.every((product) => product.trackStock)).toBe(true);
      expect(updatedProducts.find((product) => product.id === scaleProducts[0].id)?.stockQuantity).toBe(0);
      expect((await InventoryRepository.listPendingOnboarding({ search: 'CPRW3 Scale 000' })).items).toHaveLength(0);

      const existingBefore = {
        product: await prisma.product.findUniqueOrThrow({ where: { id: alreadyId } }),
        movement: await prisma.stockMovement.findFirstOrThrow({ where: { productId: alreadyId, movementType: StockMovementType.OPENING_BALANCE } }),
      };
      const skipped = await InventoryService.batchVerifyOpeningCount({
        items: [
          { productId: alreadyId, openingCount: 1 },
          { productId: archivedId, openingCount: 2 },
          { productId: randomUUID(), openingCount: 3 },
        ],
      }, { userId: adminId, role: Role.ADMIN });
      expect(skipped.skipped.map((item) => item.reason)).toEqual(['ALREADY_ONBOARDED', 'PRODUCT_ARCHIVED', 'PRODUCT_NOT_FOUND']);
      expect({
        product: await prisma.product.findUniqueOrThrow({ where: { id: alreadyId } }),
        movement: await prisma.stockMovement.findFirstOrThrow({ where: { productId: alreadyId, movementType: StockMovementType.OPENING_BALANCE } }),
      }).toEqual(existingBefore);

      const overlapping = await Promise.allSettled([
        InventoryService.batchVerifyOpeningCount({
          items: [{ productId: overlapId, openingCount: 4 }],
        }, { userId: adminId, role: Role.ADMIN }),
        InventoryService.batchVerifyOpeningCount({
          items: [{ productId: overlapId, openingCount: 4 }],
        }, { userId: adminId, role: Role.ADMIN }),
      ]);
      expect(overlapping.some((result) => result.status === 'fulfilled')).toBe(true);
      expect(await prisma.stockMovement.count({ where: { productId: overlapId, movementType: StockMovementType.OPENING_BALANCE } })).toBe(1);
    } finally {
      await prisma.stockMovement.deleteMany({ where: { productId: { in: allProductIds } } });
      await prisma.product.deleteMany({ where: { id: { in: allProductIds } } });
      await prisma.adminVerificationLog.deleteMany({ where: { userId: adminId } });
      await prisma.user.deleteMany({ where: { id: adminId } });
      await prisma.$disconnect();
    }
  }, 30_000);
});
