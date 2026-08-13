import { StockMovementType } from '@prisma/client';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

config({ path: 'backend/.env' });

const runDatabaseTests = process.env.RUN_INVENTORY_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase('inventory database contract', () => {
  it('keeps product quantity and the append-only movement ledger consistent', async () => {
    const [{ prisma }, { InventoryService }, { InventoryRepository }, { app }] = await Promise.all([
      import('../../lib/prisma.js'),
      import('./inventory.service.js'),
      import('./inventory.repository.js'),
      import('../../app.js'),
    ]);
    const adminId = randomUUID();
    const employeeId = randomUUID();
    const productId = randomUUID();
    const pendingProductId = randomUUID();
    const untrackedProductId = randomUUID();
    const password = 'inventory-admin-password';

    try {
      await prisma.user.createMany({
        data: [
          {
            id: adminId,
            username: `inventory-admin-${adminId}`,
            password: await bcrypt.hash(password, 4),
            fullName: 'Inventory Integration Admin',
            role: 'ADMIN',
          },
          {
            id: employeeId,
            username: `inventory-employee-${employeeId}`,
            password: 'not-used',
            fullName: 'Inventory Integration Employee',
            role: 'EMPLOYEE',
          },
        ],
      });
      await prisma.product.createMany({
        data: [
          {
            id: productId,
            sku: `HC-INV-${productId}`,
            name: 'Inventory Integration Product',
            model: 'INV-1',
            trackStock: true,
            stockQuantity: 0,
            lowStockThreshold: 0,
            createdById: adminId,
          },
          {
            id: pendingProductId,
            sku: `HC-PENDING-${pendingProductId}`,
            name: 'Pending Inventory Product',
            model: 'INV-2',
            trackStock: true,
            stockQuantity: 7,
            lowStockThreshold: 2,
            createdById: adminId,
          },
          {
            id: untrackedProductId,
            sku: `HC-UNTRACKED-${untrackedProductId}`,
            name: 'Untracked Inventory Product',
            model: 'INV-3',
            trackStock: false,
            stockQuantity: 0,
            lowStockThreshold: 5,
            createdById: adminId,
          },
        ],
      });

      const opening = await prisma.stockMovement.create({
        data: {
          productId,
          movementType: StockMovementType.OPENING_BALANCE,
          quantityChange: 0,
          quantityBefore: 0,
          quantityAfter: 0,
          reason: 'Verified empty shelf',
          createdById: adminId,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      expect(opening.quantityChange).toBe(0);

      await expect(prisma.stockMovement.create({
        data: {
          productId,
          movementType: StockMovementType.OPENING_BALANCE,
          quantityChange: 0,
          quantityBefore: 0,
          quantityAfter: 0,
          reason: 'Duplicate opening',
          createdById: adminId,
        },
      })).rejects.toThrow();

      for (const movementType of [
        StockMovementType.MANUAL_ADD,
        StockMovementType.MANUAL_REMOVE,
        StockMovementType.STOCK_COUNT,
        StockMovementType.DAMAGE_LOSS,
        StockMovementType.RETURN_TO_STOCK,
      ]) {
        await expect(prisma.stockMovement.create({
          data: {
            productId,
            movementType,
            quantityChange: 0,
            quantityBefore: 0,
            quantityAfter: 0,
            reason: 'Zero should fail',
            createdById: adminId,
          },
        })).rejects.toThrow();
      }

      await expect(prisma.stockMovement.create({
        data: {
          productId,
          movementType: StockMovementType.MANUAL_ADD,
          quantityChange: 1,
          quantityBefore: 0,
          quantityAfter: 1,
          reason: '   ',
          createdById: adminId,
        },
      })).rejects.toThrow();

      await expect(InventoryService.addStock(pendingProductId, {
        quantity: 1,
        expectedBefore: 7,
        reason: 'Must not become an implicit opening balance',
      }, { userId: employeeId, role: 'EMPLOYEE' })).rejects.toThrow(/verified opening count/);
      expect(await prisma.stockMovement.count({ where: { productId: pendingProductId } })).toBe(0);

      const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
      const employeeToken = jwt.sign({ userId: employeeId, role: 'EMPLOYEE' }, secret);
      const adminToken = jwt.sign({ userId: adminId, role: 'ADMIN' }, secret);
      const movementUrl = `/api/v1/products/${productId}/stock-movements`;
      const added = await request(app).post(movementUrl).set('Authorization', `Bearer ${employeeToken}`).send({
        movementType: StockMovementType.MANUAL_ADD,
        quantity: 1,
        expectedBefore: 0,
        reason: 'First unit received',
      });
      expect(added.status).toBe(201);
      expect(added.body.data).toMatchObject({ changed: true, product: { stockQuantity: 1 } });

      const counted = await InventoryService.correctStockCount(productId, {
        targetTotal: 0,
        expectedBefore: 1,
        reason: 'Verified empty again',
        accountPassword: password,
      }, { userId: adminId, role: 'ADMIN' });
      expect(counted).toMatchObject({ changed: true, product: { stockQuantity: 0 } });

      const movementCountBeforeNoOp = await prisma.stockMovement.count({ where: { productId } });
      const noOp = await InventoryService.correctStockCount(productId, {
        targetTotal: 0,
        expectedBefore: 0,
        reason: 'Second shelf verification',
        accountPassword: password,
      }, { userId: adminId, role: 'ADMIN' });
      expect(noOp).toMatchObject({ changed: false, movement: null });
      expect(await prisma.stockMovement.count({ where: { productId } })).toBe(movementCountBeforeNoOp);

      const invalidRemoval = await request(app).post(movementUrl).set('Authorization', `Bearer ${adminToken}`).send({
        movementType: StockMovementType.MANUAL_REMOVE,
        quantity: 2,
        expectedBefore: 0,
        reason: 'Impossible removal',
        accountPassword: password,
      });
      expect(invalidRemoval.status).toBe(400);
      expect(invalidRemoval.body.error.message).toMatch(/2.*0/);

      const employeeRemoval = await request(app).post(movementUrl).set('Authorization', `Bearer ${employeeToken}`).send({
        movementType: StockMovementType.MANUAL_REMOVE,
        quantity: 1,
        expectedBefore: 0,
        reason: 'Forbidden removal',
        accountPassword: password,
      });
      expect(employeeRemoval.status).toBe(403);

      const untrackedMovement = await request(app).post(`/api/v1/products/${untrackedProductId}/stock-movements`)
        .set('Authorization', `Bearer ${employeeToken}`).send({
          movementType: StockMovementType.MANUAL_ADD,
          quantity: 1,
          expectedBefore: 0,
          reason: 'Must remain untracked',
        });
      expect(untrackedMovement.status).toBe(400);

      const legacyWrite = await request(app).patch(`/api/v1/products/${productId}/stock`)
        .set('Authorization', `Bearer ${adminToken}`).send({
          trackStock: true,
          stockQuantity: 99,
          lowStockThreshold: 0,
          reason: 'Attempt legacy quantity overwrite',
          accountPassword: password,
        });
      expect(legacyWrite.status).toBe(400);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity).toBe(0);

      const settingsOnly = await request(app).patch(`/api/v1/products/${productId}/stock`)
        .set('Authorization', `Bearer ${adminToken}`).send({
          trackStock: true,
          lowStockThreshold: 0,
          reason: 'Confirm inventory settings',
          accountPassword: password,
        });
      expect(settingsOnly.status).toBe(200);
      expect(settingsOnly.body.data.stockQuantity).toBe(0);

      const history = await InventoryService.getProductMovements({ productId, page: 1, pageSize: 10 });
      expect(history.items[0].createdAt.getTime()).toBeGreaterThanOrEqual(history.items[1].createdAt.getTime());

      const lowStock = await InventoryService.getLowStockProducts({ search: 'Inventory Integration Product' });
      expect(lowStock.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: productId, stockQuantity: 0, stockStatus: 'OUT_OF_STOCK' }),
      ]));
      expect(lowStock.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: untrackedProductId })]));

      const summary = await InventoryService.getInventorySummary();
      expect(summary.outOfStockProducts).toBeGreaterThanOrEqual(1);
      const integrity = await InventoryService.getStockIntegrity();
      expect(integrity.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ productId: pendingProductId, status: 'PENDING_ONBOARDING' }),
      ]));
      expect(integrity.items).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ productId, status: 'MISMATCH' }),
      ]));

      const ledger = await prisma.stockMovement.aggregate({ where: { productId }, _sum: { quantityChange: true } });
      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(ledger._sum.quantityChange).toBe(product.stockQuantity);

      const constraints = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT conname AS name
        FROM pg_constraint
        WHERE conrelid IN ('products'::regclass, 'stock_movements'::regclass)
      `;
      expect(constraints.map((row) => row.name)).toContain('products_stockQuantity_check');
      expect(constraints.map((row) => row.name)).toEqual(expect.arrayContaining([
        'stock_movements_balance_equation_check',
        'stock_movements_nonnegative_balances_check',
        'stock_movements_nonzero_change_check',
        'stock_movements_opening_starts_zero_check',
        'stock_movements_reason_nonempty_check',
      ]));

      expect(Object.prototype.hasOwnProperty.call(InventoryRepository, 'updateMovement')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(InventoryRepository, 'deleteMovement')).toBe(false);
      await expect(prisma.product.delete({ where: { id: productId } })).rejects.toThrow();

      const emitted = await prisma.stockMovement.findMany({ where: { productId }, select: { movementType: true } });
      expect(emitted.map((row) => row.movementType)).toEqual(expect.arrayContaining([
        StockMovementType.OPENING_BALANCE,
        StockMovementType.MANUAL_ADD,
        StockMovementType.STOCK_COUNT,
      ]));
      expect(emitted.map((row) => row.movementType)).not.toEqual(expect.arrayContaining([
        StockMovementType.PURCHASE_RECEIPT,
        StockMovementType.SALE_FULFILLMENT,
        StockMovementType.SALE_CANCEL_RESTORE,
        StockMovementType.SERVICE_PART_USED,
      ]));
      expect(JSON.stringify(emitted)).not.toContain(password);
      const verificationLogs = await prisma.adminVerificationLog.findMany({
        where: { userId: adminId },
        select: { action: true, outcome: true, ipAddress: true },
      });
      expect(verificationLogs.length).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(verificationLogs)).not.toContain(password);
    } finally {
      await prisma.stockMovement.deleteMany({ where: { productId: { in: [productId, pendingProductId, untrackedProductId] } } });
      await prisma.product.deleteMany({ where: { id: { in: [productId, pendingProductId, untrackedProductId] } } });
      await prisma.serviceAudit.deleteMany({ where: { changedById: { in: [adminId, employeeId] } } });
      await prisma.adminVerificationLog.deleteMany({ where: { userId: { in: [adminId, employeeId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [adminId, employeeId] } } });
      await prisma.$disconnect();
    }
  }, 30_000);
});
