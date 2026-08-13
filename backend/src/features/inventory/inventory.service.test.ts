import { Role, StockMovementType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository, verifyAdminPassword, tx } = vi.hoisted(() => ({
  repository: {
    findProduct: vi.fn(),
    hasOpeningBalance: vi.fn(),
    compareAndSetQuantity: vi.fn(),
    setVerifiedOpeningCount: vi.fn(),
    createMovement: vi.fn(),
    listMovements: vi.fn(),
    listLowStock: vi.fn(),
    summary: vi.fn(),
    stockIntegrity: vi.fn(),
  },
  verifyAdminPassword: vi.fn(),
  tx: {},
}));

vi.mock('./inventory.repository', () => ({ InventoryRepository: repository }));
vi.mock('../../lib/admin-verification', () => ({ verifyAdminPassword }));
vi.mock('../financial/infrastructure/transaction', () => ({
  runFinancialTransaction: vi.fn((operation: (client: unknown) => unknown) => operation(tx)),
}));
vi.mock('../../lib/prisma', () => ({ prisma: {}, transactionModel: {}, activityLogModel: {} }));

import { InventoryService } from './inventory.service';
import { RESERVED_STOCK_MOVEMENT_TYPES } from './inventory.types';

const productId = '11111111-1111-4111-8111-111111111111';
const user = { userId: '22222222-2222-4222-8222-222222222222', role: Role.ADMIN };
const employee = { ...user, role: Role.EMPLOYEE };
const context = { requestId: 'request-1', ipAddress: '127.0.0.1' };
const productOf = (stockQuantity: number, overrides: Record<string, unknown> = {}) => ({
  id: productId,
  sku: 'HC-INV-1',
  name: 'Inventory Test Product',
  isActive: true,
  trackStock: true,
  stockQuantity,
  lowStockThreshold: 2,
  ...overrides,
});

describe('inventory service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findProduct.mockResolvedValue(productOf(10));
    repository.hasOpeningBalance.mockResolvedValue({ id: 'opening' });
    repository.compareAndSetQuantity.mockResolvedValue({ count: 1 });
    repository.setVerifiedOpeningCount.mockImplementation((_id, verifiedCount) => Promise.resolve(productOf(verifiedCount, { trackStock: true })));
    repository.createMovement.mockImplementation((data) => Promise.resolve({ id: 'movement', ...data }));
    verifyAdminPassword.mockResolvedValue(undefined);
  });

  it.each([0, 6])('lets an admin verify an opening count of %s and records the exact opening movement', async (verifiedCount) => {
    repository.findProduct.mockResolvedValueOnce(productOf(9, { trackStock: false }));
    repository.hasOpeningBalance.mockResolvedValueOnce(null);

    const result = await InventoryService.verifyOpeningCount(productId, {
      verifiedCount,
      reason: ' Physical shelf count ',
      note: 'Counted by manager',
      accountPassword: 'top-secret',
    }, user, context);

    expect(verifyAdminPassword).toHaveBeenCalledWith(user.userId, 'top-secret', expect.objectContaining({ action: 'VERIFY_OPENING_COUNT' }), tx);
    expect(repository.setVerifiedOpeningCount).toHaveBeenCalledWith(productId, verifiedCount, user.userId, tx);
    expect(repository.createMovement).toHaveBeenCalledTimes(1);
    expect(repository.createMovement).toHaveBeenCalledWith(expect.objectContaining({
      movementType: StockMovementType.OPENING_BALANCE,
      quantityBefore: 0,
      quantityChange: verifiedCount,
      quantityAfter: verifiedCount,
      reason: 'Physical shelf count',
      createdById: user.userId,
    }), tx);
    expect(result).toMatchObject({ changed: true, product: { trackStock: true, stockQuantity: verifiedCount } });
  });

  it('rejects employee, invalid, negative, and duplicate opening-count attempts', async () => {
    await expect(InventoryService.verifyOpeningCount(productId, {
      verifiedCount: 0, reason: 'Counted shelf', accountPassword: 'secret',
    }, employee)).rejects.toMatchObject({ statusCode: 403 });

    await expect(InventoryService.verifyOpeningCount(productId, {
      verifiedCount: -1, reason: 'Counted shelf', accountPassword: 'secret',
    }, user)).rejects.toThrow(/cannot be negative/i);

    verifyAdminPassword.mockRejectedValueOnce(new Error('Account password is incorrect'));
    await expect(InventoryService.verifyOpeningCount(productId, {
      verifiedCount: 1, reason: 'Counted shelf', accountPassword: 'wrong',
    }, user)).rejects.toThrow('Account password is incorrect');
    expect(repository.setVerifiedOpeningCount).not.toHaveBeenCalled();

    repository.hasOpeningBalance.mockResolvedValueOnce({ id: 'opening' });
    await expect(InventoryService.verifyOpeningCount(productId, {
      verifiedCount: 1, reason: 'Counted shelf again', accountPassword: 'secret',
    }, user)).rejects.toThrow(/already has a verified opening count/i);
  });

  it('allows normal stock actions immediately after a verified zero opening count', async () => {
    repository.findProduct.mockResolvedValueOnce(productOf(0, { trackStock: false }));
    repository.hasOpeningBalance.mockResolvedValueOnce(null);
    await InventoryService.verifyOpeningCount(productId, {
      verifiedCount: 0, reason: 'Verified empty shelf', accountPassword: 'secret',
    }, user);

    repository.findProduct.mockResolvedValueOnce(productOf(0));
    repository.hasOpeningBalance.mockResolvedValueOnce({ id: 'opening' });
    await InventoryService.addStock(productId, { quantity: 1, expectedBefore: 0, reason: 'First unit' }, employee);
    expect(repository.createMovement).toHaveBeenLastCalledWith(expect.objectContaining({
      movementType: StockMovementType.MANUAL_ADD, quantityBefore: 0, quantityAfter: 1,
    }), tx);
  });

  it('adds stock as an employee and writes one exact MANUAL_ADD movement', async () => {
    const result = await InventoryService.addStock(productId, {
      quantity: 5,
      expectedBefore: 10,
      reason: ' New delivery ',
      note: ' shelf A ',
    }, employee, context);

    expect(repository.compareAndSetQuantity).toHaveBeenCalledWith(productId, 10, 15, tx);
    expect(repository.createMovement).toHaveBeenCalledTimes(1);
    expect(repository.createMovement).toHaveBeenCalledWith(expect.objectContaining({
      movementType: StockMovementType.MANUAL_ADD,
      quantityChange: 5,
      quantityBefore: 10,
      quantityAfter: 15,
      reason: 'New delivery',
      note: 'shelf A',
      createdById: employee.userId,
    }), tx);
    expect(result).toMatchObject({ changed: true, product: { stockQuantity: 15 } });
    expect(verifyAdminPassword).not.toHaveBeenCalled();
  });

  it('removes stock only after admin password verification', async () => {
    await InventoryService.removeStock(productId, {
      quantity: 4,
      expectedBefore: 10,
      reason: 'Customer replacement',
      accountPassword: 'top-secret',
    }, user, context);

    expect(verifyAdminPassword).toHaveBeenCalledWith(user.userId, 'top-secret', expect.objectContaining({
      action: 'REMOVE_STOCK',
      recordId: productId,
    }), tx);
    expect(repository.createMovement).toHaveBeenCalledWith(expect.objectContaining({
      movementType: StockMovementType.MANUAL_REMOVE,
      quantityChange: -4,
      quantityAfter: 6,
    }), tx);
    expect(JSON.stringify(repository.createMovement.mock.calls)).not.toContain('top-secret');
  });

  it('rejects over-removal in the service with both numbers before database writes', async () => {
    await expect(InventoryService.removeStock(productId, {
      quantity: 11,
      reason: 'Damaged shipment',
      accountPassword: 'top-secret',
    }, user, context)).rejects.toThrow(/11.*10/);

    expect(repository.compareAndSetQuantity).not.toHaveBeenCalled();
    expect(repository.createMovement).not.toHaveBeenCalled();
    expect(verifyAdminPassword).not.toHaveBeenCalled();
  });

  it.each([
    [15, 5],
    [3, -7],
  ])('records a stock count target of %s with a signed delta of %s', async (targetTotal, quantityChange) => {
    await InventoryService.correctStockCount(productId, {
      targetTotal,
      expectedBefore: 10,
      reason: 'Physical shelf count',
      accountPassword: 'top-secret',
    }, user, context);

    expect(repository.createMovement).toHaveBeenCalledWith(expect.objectContaining({
      movementType: StockMovementType.STOCK_COUNT,
      quantityBefore: 10,
      quantityAfter: targetTotal,
      quantityChange,
    }), tx);
  });

  it('returns the bilingual success-shaped no-op for an equal stock count', async () => {
    const result = await InventoryService.correctStockCount(productId, {
      targetTotal: 10,
      expectedBefore: 10,
      reason: 'Physical shelf count',
      accountPassword: 'top-secret',
    }, user, context);

    expect(result).toEqual(expect.objectContaining({
      changed: false,
      message: 'Count matches current stock. Nothing to record. / الجرد مطابق للمخزون الحالي. لا يوجد ما يُسجَّل.',
      movement: null,
    }));
    expect(repository.compareAndSetQuantity).not.toHaveBeenCalled();
    expect(repository.createMovement).not.toHaveBeenCalled();
    expect(verifyAdminPassword).toHaveBeenCalledWith(user.userId, 'top-secret', expect.objectContaining({
      action: 'CORRECT_STOCK_COUNT',
    }), tx);
  });

  it('uses DAMAGE_LOSS for guarded removal and RETURN_TO_STOCK for employee additions', async () => {
    await InventoryService.markDamagedLost(productId, {
      quantity: 2, reason: 'Broken in storage', accountPassword: 'top-secret',
    }, user, context);
    expect(repository.createMovement).toHaveBeenLastCalledWith(expect.objectContaining({
      movementType: StockMovementType.DAMAGE_LOSS, quantityChange: -2,
    }), tx);

    await InventoryService.returnToStock(productId, {
      quantity: 2, reason: 'Unused replacement returned',
    }, employee, context);
    expect(repository.createMovement).toHaveBeenLastCalledWith(expect.objectContaining({
      movementType: StockMovementType.RETURN_TO_STOCK, quantityChange: 2,
    }), tx);
  });

  it('rejects untracked and never-onboarded products without manufacturing an opening balance', async () => {
    repository.findProduct.mockResolvedValueOnce(productOf(10, { trackStock: false }));
    await expect(InventoryService.addStock(productId, {
      quantity: 1, reason: 'New delivery',
    }, employee)).rejects.toThrow(/tracking is disabled/i);

    repository.findProduct.mockResolvedValueOnce(productOf(10));
    repository.hasOpeningBalance.mockResolvedValueOnce(null);
    await expect(InventoryService.addStock(productId, {
      quantity: 1, reason: 'New delivery',
    }, employee)).rejects.toThrow(
      'This product needs a verified opening count before stock actions / يحتاج هذا المنتج جردًا مؤكدًا قبل حركات المخزون'
    );

    expect(repository.compareAndSetQuantity).not.toHaveBeenCalled();
    expect(repository.createMovement).not.toHaveBeenCalled();
  });

  it('requires admin and password for remove, count, and damage/loss', async () => {
    for (const call of [
      () => InventoryService.removeStock(productId, { quantity: 1, reason: 'Stock correction', accountPassword: 'x' }, employee),
      () => InventoryService.correctStockCount(productId, { targetTotal: 8, reason: 'Stock correction', accountPassword: 'x' }, employee),
      () => InventoryService.markDamagedLost(productId, { quantity: 1, reason: 'Stock correction', accountPassword: 'x' }, employee),
    ]) await expect(call()).rejects.toMatchObject({ statusCode: 403 });

    await expect(InventoryService.removeStock(productId, {
      quantity: 1, reason: 'Stock correction', accountPassword: '',
    }, user)).rejects.toThrow('Account password is required');
  });

  it.each([0, -1, 1.5, 1_000_000])('rejects invalid movement quantity %s before reaching PostgreSQL', async (quantity) => {
    await expect(InventoryService.addStock(productId, {
      quantity, reason: 'New delivery',
    }, employee)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.findProduct).not.toHaveBeenCalled();
  });

  it('requires a nonblank reason before reaching PostgreSQL', async () => {
    await expect(InventoryService.addStock(productId, {
      quantity: 1, reason: '   ',
    }, employee)).rejects.toThrow('Reason is required');
    expect(repository.findProduct).not.toHaveBeenCalled();
  });

  it('aborts on a caller-stale expectedBefore and on a failed transactional CAS', async () => {
    await expect(InventoryService.addStock(productId, {
      quantity: 1, expectedBefore: 9, reason: 'New delivery',
    }, employee)).rejects.toThrow(/expected 9.*10/);
    expect(repository.compareAndSetQuantity).not.toHaveBeenCalled();

    repository.compareAndSetQuantity.mockResolvedValueOnce({ count: 0 });
    await expect(InventoryService.addStock(productId, {
      quantity: 1, expectedBefore: 10, reason: 'New delivery',
    }, employee)).rejects.toThrow(/expected 10.*different value/);
    expect(repository.createMovement).not.toHaveBeenCalled();
  });

  it('reports all four integrity states without counting NOT_IN_INVENTORY as pending', async () => {
    repository.stockIntegrity.mockResolvedValue([
      { productId: 'a', status: 'OK' },
      { productId: 'n', status: 'NOT_IN_INVENTORY' },
      { productId: 'b', status: 'PENDING_ONBOARDING' },
      { productId: 'c', status: 'MISMATCH' },
    ]);
    await expect(InventoryService.getStockIntegrity()).resolves.toEqual(expect.objectContaining({
      available: true,
      totalProducts: 4,
      ok: 1,
      notInInventory: 1,
      pendingOnboarding: 1,
      mismatch: 1,
      items: [
        expect.objectContaining({ productId: 'n' }),
        expect.objectContaining({ productId: 'b' }),
        expect.objectContaining({ productId: 'c' }),
      ],
    }));
  });

  it('returns a safe maintenance result when the inventory migration is still pending', async () => {
    repository.stockIntegrity.mockRejectedValueOnce(new Error('relation stock_movements does not exist'));
    await expect(InventoryService.getMaintenanceStockIntegrity()).resolves.toEqual(expect.objectContaining({
      available: false,
      message: expect.stringContaining('database update'),
    }));
  });

  it('keeps reserved enum values outside every v1.8 mutation path', async () => {
    const calls = [
      () => InventoryService.addStock(productId, { quantity: 1, reason: 'Delivery' }, employee),
      () => InventoryService.removeStock(productId, { quantity: 1, reason: 'Correction', accountPassword: 'x' }, user),
      () => InventoryService.correctStockCount(productId, { targetTotal: 9, reason: 'Count', accountPassword: 'x' }, user),
      () => InventoryService.markDamagedLost(productId, { quantity: 1, reason: 'Damage', accountPassword: 'x' }, user),
      () => InventoryService.returnToStock(productId, { quantity: 1, reason: 'Return' }, employee),
    ];
    for (const call of calls) await call();
    const emitted = repository.createMovement.mock.calls.map(([data]) => data.movementType);
    expect(emitted.some((type) => RESERVED_STOCK_MOVEMENT_TYPES.includes(type))).toBe(false);
  });
});
