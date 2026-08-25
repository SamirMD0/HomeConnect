import { Role, StockMovementType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INVENTORY_QUANTITY_LIMIT } from './inventory.types';

const { repository, verifyAdminPassword, runTransaction, tx } = vi.hoisted(() => ({
  repository: {
    findProductsForOnboarding: vi.fn(),
    findOpeningBalances: vi.fn(),
    hasOpeningBalance: vi.fn(),
    setVerifiedOpeningCount: vi.fn(),
    createMovement: vi.fn(),
    listPendingOnboarding: vi.fn(),
  },
  verifyAdminPassword: vi.fn(),
  runTransaction: vi.fn(),
  tx: { kind: 'transaction' },
}));

vi.mock('./inventory.repository', () => ({ InventoryRepository: repository }));
vi.mock('../../lib/admin-verification', () => ({ verifyAdminPassword }));
vi.mock('../financial/infrastructure/transaction', () => ({ runFinancialTransaction: runTransaction }));

import { InventoryService } from './inventory.service';

const admin = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: Role.ADMIN };
const employee = { userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: Role.EMPLOYEE };
const context = { ipAddress: '127.0.0.1' };
const idFor = (index: number) => `${index.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
const productOf = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, sku: `HC-${id.slice(0, 8)}`, name: `Product ${id.slice(0, 8)}`, model: 'M1', brand: null,
  barcode: null, isActive: true, trackStock: false, stockQuantity: 0, lowStockThreshold: null,
  ...overrides,
});
const inputOf = (items: Array<{ productId: string; openingCount: number; note?: string | null }>, dryRun = false) => ({
  dryRun, items,
});

describe('batch inventory onboarding service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runTransaction.mockImplementation((operation) => operation(tx));
    verifyAdminPassword.mockResolvedValue(undefined);
    repository.findOpeningBalances.mockResolvedValue([]);
    repository.hasOpeningBalance.mockResolvedValue(null);
    repository.setVerifiedOpeningCount.mockImplementation((id, count) => Promise.resolve(productOf(id, { trackStock: true, stockQuantity: count })));
    repository.createMovement.mockImplementation((data) => Promise.resolve({ id: `movement-${data.productId}`, ...data }));
  });

  it('rejects unauthenticated and non-admin callers on both the dry run and the write', async () => {
    for (const dryRun of [true, false]) {
      const input = inputOf([{ productId: idFor(1), openingCount: 0 }], dryRun);
      await expect(InventoryService.batchVerifyOpeningCount(input, undefined as never)).rejects.toMatchObject({ statusCode: 403 });
      await expect(InventoryService.batchVerifyOpeningCount(input, employee)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(repository.setVerifiedOpeningCount).not.toHaveBeenCalled();
    expect(repository.createMovement).not.toHaveBeenCalled();
  });

  it('requires no password or typed reason for either the write or dry run', async () => {
    const items = [{ productId: idFor(1), openingCount: 0 }];
    repository.findProductsForOnboarding.mockResolvedValue([productOf(idFor(1))]);

    await expect(InventoryService.batchVerifyOpeningCount({ dryRun: false, items }, admin))
      .resolves.toMatchObject({ dryRun: false });
    await expect(InventoryService.batchVerifyOpeningCount({ dryRun: true, items }, admin))
      .resolves.toMatchObject({ dryRun: true });
    expect(verifyAdminPassword).not.toHaveBeenCalled();
  });

  it('writes one exact opening movement per row with one shared UUID and a fixed audit reason', async () => {
    const items = [
      { productId: idFor(1), openingCount: 3, note: 'Shelf A' },
      { productId: idFor(2), openingCount: 0 },
      { productId: idFor(3), openingCount: 7, note: null },
    ];
    repository.findProductsForOnboarding.mockResolvedValue(items.map((item) => productOf(item.productId)));

    const result = await InventoryService.batchVerifyOpeningCount(inputOf(items), admin, context);

    expect(result).toMatchObject({ dryRun: false, counts: { written: 3, skipped: 0 } });
    expect(result.batchId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(verifyAdminPassword).not.toHaveBeenCalled();
    expect(repository.setVerifiedOpeningCount).toHaveBeenCalledTimes(3);
    expect(repository.createMovement).toHaveBeenCalledTimes(3);
    for (const [index, call] of repository.createMovement.mock.calls.entries()) {
      const data = call[0];
      expect(data).toMatchObject({
        productId: items[index].productId,
        movementType: StockMovementType.OPENING_BALANCE,
        quantityChange: items[index].openingCount,
        quantityBefore: 0,
        quantityAfter: items[index].openingCount,
        reason: 'Initial shop-floor stock count / جرد افتتاحي',
        note: items[index].note ?? null,
        referenceType: 'MANUAL_BATCH',
        referenceId: result.batchId,
        createdById: admin.userId,
      });
    }
  });

  it('skips onboarded, archived, and missing rows without touching existing data', async () => {
    const alreadyId = idFor(1);
    const archivedId = idFor(2);
    const missingId = idFor(3);
    const existingMovement = { id: 'existing-opening', productId: alreadyId, movementType: 'OPENING_BALANCE', quantityAfter: 9 };
    const existingProduct = productOf(alreadyId, { trackStock: true, stockQuantity: 9 });
    const before = JSON.stringify({ existingMovement, existingProduct });
    repository.findProductsForOnboarding.mockResolvedValue([
      existingProduct,
      productOf(archivedId, { isActive: false }),
    ]);
    repository.findOpeningBalances.mockResolvedValue([existingMovement]);

    const result = await InventoryService.batchVerifyOpeningCount(inputOf([
      { productId: alreadyId, openingCount: 1 },
      { productId: archivedId, openingCount: 2 },
      { productId: missingId, openingCount: 3 },
    ]), admin);

    expect(result).toMatchObject({
      counts: { written: 0, skipped: 3 },
      skipped: [
        { productId: alreadyId, reason: 'ALREADY_ONBOARDED' },
        { productId: archivedId, reason: 'PRODUCT_ARCHIVED' },
        { productId: missingId, reason: 'PRODUCT_NOT_FOUND' },
      ],
    });
    expect(repository.setVerifiedOpeningCount).not.toHaveBeenCalled();
    expect(repository.createMovement).not.toHaveBeenCalled();
    expect(JSON.stringify({ existingMovement, existingProduct })).toBe(before);
  });

  it('rejects one invalid count in 100 rows before opening a transaction or writing anything', async () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      productId: idFor(index + 1),
      openingCount: index === 49 ? INVENTORY_QUANTITY_LIMIT + 1 : 0,
    }));
    await expect(InventoryService.batchVerifyOpeningCount(inputOf(items), admin)).rejects.toThrow(/must not exceed/i);
    expect(runTransaction).not.toHaveBeenCalled();
    expect(repository.setVerifiedOpeningCount).not.toHaveBeenCalled();
    expect(repository.createMovement).not.toHaveBeenCalled();
  });

  it('dry-runs as role-gated plain reads, with no password and no transaction', async () => {
    const validId = idFor(1);
    const onboardedId = idFor(2);
    repository.findProductsForOnboarding.mockResolvedValue([productOf(validId), productOf(onboardedId)]);
    repository.findOpeningBalances.mockResolvedValue([{ id: 'opening', productId: onboardedId }]);

    const result = await InventoryService.batchVerifyOpeningCount(inputOf([
      { productId: validId, openingCount: 0 },
      { productId: onboardedId, openingCount: 4 },
    ], true), admin, context);

    expect(result).toEqual({
      dryRun: true,
      batchId: null,
      valid: [{ productId: validId, openingCount: 0 }],
      skipped: [{ productId: onboardedId, reason: 'ALREADY_ONBOARDED' }],
      counts: { valid: 1, skipped: 1 },
    });
    // A dry run writes nothing and reads only what the worklist already exposes,
    // so it must not spend an attempt against the admin-password lockout.
    expect(verifyAdminPassword).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
    expect(repository.setVerifiedOpeningCount).not.toHaveBeenCalled();
    expect(repository.createMovement).not.toHaveBeenCalled();
  });

  it('serializes overlapping batches so one writes and the other skips the same product', async () => {
    const productId = idFor(1);
    const onboarded = new Set<string>();
    let queue = Promise.resolve<unknown>(undefined);
    runTransaction.mockImplementation((operation) => {
      const result = queue.then(() => operation(tx));
      queue = result.then(() => undefined, () => undefined);
      return result;
    });
    repository.findProductsForOnboarding.mockResolvedValue([productOf(productId)]);
    repository.findOpeningBalances.mockImplementation(() => Promise.resolve(
      onboarded.has(productId) ? [{ id: 'opening', productId }] : []
    ));
    repository.hasOpeningBalance.mockImplementation(() => Promise.resolve(onboarded.has(productId) ? { id: 'opening' } : null));
    repository.createMovement.mockImplementation((data) => {
      onboarded.add(data.productId);
      return Promise.resolve({ id: 'opening', ...data });
    });

    const [first, second] = await Promise.all([
      InventoryService.batchVerifyOpeningCount(inputOf([{ productId, openingCount: 2 }]), admin),
      InventoryService.batchVerifyOpeningCount(inputOf([{ productId, openingCount: 2 }]), admin),
    ]);

    expect([first, second].reduce((total, result) => total + ('written' in result ? result.written.length : 0), 0)).toBe(1);
    expect([first, second].reduce((total, result) => total + result.skipped.length, 0)).toBe(1);
    expect(repository.createMovement).toHaveBeenCalledTimes(1);
  });
});
