import {
  Role, StockMovementType, SupplierReceivingAuditAction, SupplierReceivingItemStatus,
  SupplierReceivingStatus, SupplierTransactionStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = { id: 'tx' };
const { receivingRepository, inventoryRepository, verifyAdminPassword } = vi.hoisted(() => ({
  receivingRepository: {
    findSupplier: vi.fn(), create: vi.fn(), createItem: vi.fn(), findById: vi.fn(), findDuplicate: vi.fn(), list: vi.fn(),
    findForCorrection: vi.fn(), updateMetadata: vi.fn(), markVoided: vi.fn(), reverseItem: vi.fn(), createAudit: vi.fn(), findActor: vi.fn(),
  },
  inventoryRepository: { findProduct: vi.fn(), findOpeningBalance: vi.fn(), compareAndSetQuantity: vi.fn(), createMovement: vi.fn() },
  verifyAdminPassword: vi.fn(),
}));
vi.mock('./supplier-receivings.repository', () => ({ SupplierReceivingsRepository: receivingRepository }));
vi.mock('../inventory.repository', () => ({ InventoryRepository: inventoryRepository }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword }));
vi.mock('../../financial/infrastructure/transaction', () => ({ runFinancialTransaction: vi.fn((operation: (client: unknown) => unknown) => operation(tx)) }));

import { SupplierReceivingsService } from './supplier-receivings.service';

const user = { userId: '11111111-1111-4111-8111-111111111111', role: Role.EMPLOYEE };
const supplierId = '22222222-2222-4222-8222-222222222222';
const firstId = '33333333-3333-4333-8333-333333333333';
const secondId = '44444444-4444-4444-8444-444444444444';
const opening = { id: 'opening', createdAt: new Date('2026-08-13T21:30:00.000Z') };
const product = (id: string, quantity = 4) => ({ id, sku: `SKU-${id[0]}`, name: 'Product', isActive: true, trackStock: true, stockQuantity: quantity, lowStockThreshold: null });

describe('SupplierReceivingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BUSINESS_TIMEZONE = 'Asia/Beirut';
    receivingRepository.findSupplier.mockResolvedValue({ id: supplierId, name: 'Supplier One', isActive: true });
    receivingRepository.create.mockResolvedValue({ id: '55555555-5555-4555-8555-555555555555' });
    receivingRepository.createItem.mockResolvedValue({});
    receivingRepository.findById.mockResolvedValue({ id: '55555555-5555-4555-8555-555555555555', receivedOn: new Date('2026-08-14T00:00:00.000Z'), items: [] });
    inventoryRepository.findProduct.mockImplementation(async (id: string) => product(id));
    inventoryRepository.findOpeningBalance.mockResolvedValue(opening);
    inventoryRepository.compareAndSetQuantity.mockResolvedValue({ count: 1 });
    inventoryRepository.createMovement.mockResolvedValue({ id: '66666666-6666-4666-8666-666666666666' });
  });

  it('creates a multi-item receiving in sorted order and writes linked PURCHASE_RECEIPT movements', async () => {
    await SupplierReceivingsService.create({ supplierId, referenceNumber: ' INV-9 ', note: ' Shelf delivery ', receivedOn: '2026-08-14', items: [{ productId: secondId, quantity: 3 }, { productId: firstId, quantity: 2 }] }, user);

    expect(receivingRepository.create.mock.invocationCallOrder[0] ?? 0).toBeGreaterThan(inventoryRepository.findOpeningBalance.mock.invocationCallOrder.at(-1) ?? 0);
    expect(receivingRepository.create).toHaveBeenCalledWith(expect.objectContaining({ supplierId, referenceNumber: 'INV-9', note: 'Shelf delivery', receivedById: user.userId }), tx);
    expect(inventoryRepository.compareAndSetQuantity.mock.calls.map((call) => call[0])).toEqual([firstId, secondId]);
    expect(inventoryRepository.createMovement).toHaveBeenCalledTimes(2);
    expect(inventoryRepository.createMovement).toHaveBeenCalledWith(expect.objectContaining({ movementType: StockMovementType.PURCHASE_RECEIPT, referenceType: 'SUPPLIER_RECEIVING_ITEM', createdById: user.userId }), tx);
    const movement = inventoryRepository.createMovement.mock.calls[0][0];
    const item = receivingRepository.createItem.mock.calls[0][0];
    expect(item.id).toBe(movement.referenceId);
    expect(item.stockMovementId).toBe('66666666-6666-4666-8666-666666666666');
  });

  it('allows no supplier and normalizes blank reference and note to null', async () => {
    await SupplierReceivingsService.create({ supplierId: null, referenceNumber: '   ', note: ' ', receivedOn: '2026-08-14', items: [{ productId: firstId, quantity: 1 }] }, user);
    expect(receivingRepository.findSupplier).not.toHaveBeenCalled();
    expect(receivingRepository.create).toHaveBeenCalledWith(expect.objectContaining({ supplierId: null, referenceNumber: null, note: null }), tx);
  });

  it('rejects archived and unknown suppliers before any write', async () => {
    receivingRepository.findSupplier.mockResolvedValueOnce({ id: supplierId, name: 'Old', isActive: false });
    await expect(SupplierReceivingsService.create({ supplierId, receivedOn: '2026-08-14', items: [{ productId: firstId, quantity: 1 }] }, user)).rejects.toMatchObject({ code: 'SUPPLIER_ARCHIVED' });
    expect(receivingRepository.create).not.toHaveBeenCalled();
    receivingRepository.findSupplier.mockResolvedValueOnce(null);
    await expect(SupplierReceivingsService.create({ supplierId, receivedOn: '2026-08-14', items: [{ productId: firstId, quantity: 1 }] }, user)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects untracked and not-onboarded products before creating the document', async () => {
    inventoryRepository.findProduct.mockResolvedValueOnce({ ...product(firstId), trackStock: false });
    await expect(SupplierReceivingsService.create({ receivedOn: '2026-08-14', items: [{ productId: firstId, quantity: 1 }] }, user)).rejects.toThrow('Stock tracking is disabled');
    inventoryRepository.findProduct.mockResolvedValueOnce(product(firstId));
    inventoryRepository.findOpeningBalance.mockResolvedValueOnce(null);
    await expect(SupplierReceivingsService.create({ receivedOn: '2026-08-14', items: [{ productId: firstId, quantity: 1 }] }, user)).rejects.toThrow('verified opening count');
    expect(receivingRepository.create).not.toHaveBeenCalled();
  });

  it('compares receiving and opening timestamps in the Beirut business date', async () => {
    await expect(SupplierReceivingsService.create({ receivedOn: '2026-08-13', items: [{ productId: firstId, quantity: 1 }] }, user)).rejects.toThrow('before the verified opening count');
    expect(receivingRepository.create).not.toHaveBeenCalled();
    await expect(SupplierReceivingsService.create({ receivedOn: '2026-08-14', items: [{ productId: firstId, quantity: 1 }] }, user)).resolves.toBeTruthy();
    inventoryRepository.findOpeningBalance.mockResolvedValue({ id: 'older-opening', createdAt: new Date('2026-08-12T12:00:00.000Z') });
    await expect(SupplierReceivingsService.create({ receivedOn: '2026-08-14', items: [{ productId: firstId, quantity: 1 }] }, user)).resolves.toBeTruthy();
  });

  it('rejects database overflow before the first write', async () => {
    inventoryRepository.findProduct.mockResolvedValue(product(firstId, 2_147_483_647));
    await expect(SupplierReceivingsService.create({ receivedOn: '2026-08-14', items: [{ productId: firstId, quantity: 1 }] }, user)).rejects.toThrow('maximum supported');
    expect(receivingRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a future receiving date before opening a transaction', async () => {
    await expect(SupplierReceivingsService.create({ receivedOn: '2099-01-01', items: [{ productId: firstId, quantity: 1 }] }, user)).rejects.toThrow('future');
    expect(receivingRepository.findSupplier).not.toHaveBeenCalled();
    expect(receivingRepository.create).not.toHaveBeenCalled();
  });

  it('reports a clean stock conflict when compare-and-set loses a race', async () => {
    inventoryRepository.compareAndSetQuantity.mockResolvedValueOnce({ count: 0 });
    await expect(SupplierReceivingsService.create({ receivedOn: '2026-08-14', items: [{ productId: firstId, quantity: 1 }] }, user)).rejects.toMatchObject({ code: 'STOCK_CHANGED', statusCode: 409 });
    expect(inventoryRepository.createMovement).not.toHaveBeenCalled();
    expect(receivingRepository.createItem).not.toHaveBeenCalled();
  });

  it('rejects roles outside ADMIN and EMPLOYEE', async () => {
    await expect(SupplierReceivingsService.create({ receivedOn: '2026-08-14', items: [{ productId: firstId, quantity: 1 }] }, { ...user, role: 'VIEWER' })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns a duplicate-reference warning without blocking creation', async () => {
    receivingRepository.findDuplicate.mockResolvedValue({ id: 'existing', receivedOn: new Date('2026-08-14T00:00:00.000Z') });
    await expect(SupplierReceivingsService.duplicateCheck({ supplierId, referenceNumber: ' INV-9 ' }, user)).resolves.toMatchObject({ duplicate: true, match: { id: 'existing', receivedOn: '2026-08-14' } });
    expect(receivingRepository.findDuplicate).toHaveBeenCalledWith(supplierId, 'INV-9');
  });
});

const admin = { userId: '77777777-7777-4777-8777-777777777777', role: Role.ADMIN };
const receivingId = '55555555-5555-4555-8555-555555555555';
const firstItemId = '88888888-8888-4888-8888-888888888888';
const secondItemId = '99999999-9999-4999-8999-999999999999';
const posted = (overrides: Record<string, unknown> = {}) => ({
  id: receivingId,
  referenceNumber: 'INV-9',
  note: 'Shelf delivery',
  receivedOn: new Date('2026-08-14T00:00:00.000Z'),
  status: SupplierReceivingStatus.POSTED,
  supplier: { id: supplierId, name: 'Supplier One' },
  items: [
    { id: firstItemId, productId: firstId, quantity: 2, status: SupplierReceivingItemStatus.ACTIVE, stockMovementId: 'movement-1' },
    { id: secondItemId, productId: secondId, quantity: 3, status: SupplierReceivingItemStatus.ACTIVE, stockMovementId: 'movement-2' },
  ],
  transactions: [],
  ...overrides,
});

describe('SupplierReceivingsService admin correction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BUSINESS_TIMEZONE = 'Asia/Beirut';
    receivingRepository.findForCorrection.mockResolvedValue(posted());
    receivingRepository.findById.mockResolvedValue({ id: receivingId, receivedOn: new Date('2026-08-14T00:00:00.000Z'), items: [] });
    receivingRepository.updateMetadata.mockResolvedValue({ count: 1 });
    receivingRepository.markVoided.mockResolvedValue({ count: 1 });
    receivingRepository.reverseItem.mockResolvedValue({ count: 1 });
    receivingRepository.createAudit.mockResolvedValue({});
    receivingRepository.findActor.mockResolvedValue({ fullName: 'Admin One', username: 'admin1' });
    inventoryRepository.findProduct.mockImplementation(async (id: string) => product(id, 10));
    inventoryRepository.compareAndSetQuantity.mockResolvedValue({ count: 1 });
    inventoryRepository.createMovement.mockImplementation(async () => ({ id: `reversal-${inventoryRepository.createMovement.mock.calls.length}` }));
    verifyAdminPassword.mockResolvedValue(undefined);
  });

  describe('updateMetadata', () => {
    it('corrects reference and note, audits it, and moves no stock', async () => {
      await SupplierReceivingsService.updateMetadata(receivingId, { referenceNumber: ' INV-10 ', note: '  ', reason: 'Wrong invoice number typed' }, admin);

      expect(receivingRepository.updateMetadata).toHaveBeenCalledWith(receivingId, { referenceNumber: 'INV-10', note: null }, tx);
      expect(receivingRepository.createAudit).toHaveBeenCalledWith(expect.objectContaining({
        receivingId,
        action: SupplierReceivingAuditAction.UPDATE_METADATA,
        changedById: admin.userId,
        changedByName: 'Admin One',
        reason: 'Wrong invoice number typed',
        beforeValues: { referenceNumber: 'INV-9', note: 'Shelf delivery' },
        afterValues: { referenceNumber: 'INV-10', note: null },
      }), tx);
      expect(inventoryRepository.createMovement).not.toHaveBeenCalled();
      expect(inventoryRepository.compareAndSetQuantity).not.toHaveBeenCalled();
    });

    it('asks for no account password, because paperwork moves no stock', async () => {
      await SupplierReceivingsService.updateMetadata(receivingId, { referenceNumber: 'INV-10', note: null, reason: 'Wrong invoice number typed' }, admin);
      expect(verifyAdminPassword).not.toHaveBeenCalled();
    });

    it('refuses employees, unknown documents, and voided documents', async () => {
      await expect(SupplierReceivingsService.updateMetadata(receivingId, { referenceNumber: 'INV-10', note: null, reason: 'Wrong invoice number' }, user)).rejects.toMatchObject({ statusCode: 403 });
      expect(receivingRepository.updateMetadata).not.toHaveBeenCalled();

      receivingRepository.findForCorrection.mockResolvedValueOnce(null);
      await expect(SupplierReceivingsService.updateMetadata(receivingId, { referenceNumber: 'INV-10', note: null, reason: 'Wrong invoice number' }, admin)).rejects.toMatchObject({ statusCode: 404 });

      receivingRepository.findForCorrection.mockResolvedValueOnce(posted({ status: SupplierReceivingStatus.VOIDED }));
      await expect(SupplierReceivingsService.updateMetadata(receivingId, { referenceNumber: 'INV-10', note: null, reason: 'Wrong invoice number' }, admin)).rejects.toMatchObject({ code: 'RECEIVING_ALREADY_VOIDED', statusCode: 409 });
      expect(receivingRepository.updateMetadata).not.toHaveBeenCalled();
    });
  });

  describe('void', () => {
    const voidInput = { reason: 'Delivery returned to the supplier', accountPassword: 'secret' };

    it('writes one negative reversal movement per line and marks the document voided', async () => {
      await SupplierReceivingsService.void(receivingId, voidInput, admin);

      expect(verifyAdminPassword).toHaveBeenCalledWith(admin.userId, 'secret', expect.objectContaining({ action: 'VOID_SUPPLIER_RECEIVING', recordId: receivingId }), tx);
      expect(inventoryRepository.createMovement).toHaveBeenCalledTimes(2);
      expect(inventoryRepository.createMovement).toHaveBeenNthCalledWith(1, expect.objectContaining({
        productId: firstId,
        movementType: StockMovementType.PURCHASE_RECEIPT_REVERSAL,
        quantityChange: -2,
        quantityBefore: 10,
        quantityAfter: 8,
        referenceType: 'SUPPLIER_RECEIVING_ITEM',
        referenceId: firstItemId,
        createdById: admin.userId,
      }), tx);
      expect(inventoryRepository.compareAndSetQuantity).toHaveBeenNthCalledWith(1, firstId, 10, 8, tx);
      expect(inventoryRepository.compareAndSetQuantity).toHaveBeenNthCalledWith(2, secondId, 10, 7, tx);
      expect(receivingRepository.reverseItem).toHaveBeenCalledWith(firstItemId, expect.objectContaining({ reversalStockMovementId: 'reversal-1', reversedById: admin.userId, reversalReason: voidInput.reason }), tx);
      expect(receivingRepository.markVoided).toHaveBeenCalledWith(receivingId, expect.objectContaining({ voidedById: admin.userId, voidReason: voidInput.reason }), tx);
    });

    it('keeps the original document and its original movements exactly as posted', async () => {
      await SupplierReceivingsService.void(receivingId, voidInput, admin);
      // Nothing deletes, and no call rewrites the movement the receipt originally wrote.
      expect(receivingRepository.createItem).not.toHaveBeenCalled();
      for (const call of inventoryRepository.createMovement.mock.calls) {
        expect(call[0].movementType).toBe(StockMovementType.PURCHASE_RECEIPT_REVERSAL);
      }
      expect(receivingRepository.markVoided.mock.calls[0][1]).not.toHaveProperty('items');
    });

    it('audits the void with the before/after balances of every reversal', async () => {
      await SupplierReceivingsService.void(receivingId, voidInput, admin);
      const audit = receivingRepository.createAudit.mock.calls[0][0];
      expect(audit).toMatchObject({ action: SupplierReceivingAuditAction.VOID, reason: voidInput.reason, changedById: admin.userId });
      expect(audit.afterValues.reversals).toEqual([
        expect.objectContaining({ itemId: firstItemId, productId: firstId, quantity: 2, quantityBefore: 10, quantityAfter: 8, originalMovementId: 'movement-1', reversalMovementId: 'reversal-1' }),
        expect.objectContaining({ itemId: secondItemId, productId: secondId, quantity: 3, quantityBefore: 10, quantityAfter: 7, originalMovementId: 'movement-2', reversalMovementId: 'reversal-2' }),
      ]);
    });

    it('refuses to drive stock negative and names every product that is short', async () => {
      inventoryRepository.findProduct.mockImplementation(async (id: string) => product(id, 1));
      await expect(SupplierReceivingsService.void(receivingId, voidInput, admin)).rejects.toMatchObject({ code: 'REVERSAL_WOULD_GO_NEGATIVE', statusCode: 409 });
      await expect(SupplierReceivingsService.void(receivingId, voidInput, admin)).rejects.toThrow(/already been sold or used/);
      // Refused before anything was written, so the shelf is untouched.
      expect(inventoryRepository.compareAndSetQuantity).not.toHaveBeenCalled();
      expect(inventoryRepository.createMovement).not.toHaveBeenCalled();
      expect(receivingRepository.markVoided).not.toHaveBeenCalled();
    });

    it('rejects a second void of the same document', async () => {
      receivingRepository.findForCorrection.mockResolvedValue(posted({ status: SupplierReceivingStatus.VOIDED }));
      await expect(SupplierReceivingsService.void(receivingId, voidInput, admin)).rejects.toMatchObject({ code: 'RECEIVING_ALREADY_VOIDED', statusCode: 409 });
      expect(verifyAdminPassword).not.toHaveBeenCalled();
      expect(inventoryRepository.compareAndSetQuantity).not.toHaveBeenCalled();
    });

    it('loses a compare-and-set race cleanly, before any movement is written', async () => {
      inventoryRepository.compareAndSetQuantity.mockResolvedValueOnce({ count: 0 });
      await expect(SupplierReceivingsService.void(receivingId, voidInput, admin)).rejects.toMatchObject({ code: 'STOCK_CHANGED', statusCode: 409 });
      expect(inventoryRepository.createMovement).not.toHaveBeenCalled();
      expect(receivingRepository.markVoided).not.toHaveBeenCalled();
    });

    /**
     * The supplier ledger belongs to the supplier module. Rather than reach
     * across that boundary, the void refuses while money is still posted and
     * tells the admin where to remove it.
     */
    it('refuses while an active supplier debt is still posted, and changes no ledger row', async () => {
      receivingRepository.findForCorrection.mockResolvedValue(posted({ transactions: [{ id: 'debt-1', status: SupplierTransactionStatus.ACTIVE }] }));
      await expect(SupplierReceivingsService.void(receivingId, voidInput, admin)).rejects.toMatchObject({ code: 'RECEIVING_HAS_ACTIVE_DEBT', statusCode: 409 });
      expect(verifyAdminPassword).not.toHaveBeenCalled();
      expect(inventoryRepository.compareAndSetQuantity).not.toHaveBeenCalled();
    });

    it('proceeds once the linked debt has already been removed in the ledger', async () => {
      receivingRepository.findForCorrection.mockResolvedValue(posted({ transactions: [{ id: 'debt-1', status: SupplierTransactionStatus.REMOVED }] }));
      await expect(SupplierReceivingsService.void(receivingId, voidInput, admin)).resolves.toBeTruthy();
      expect(receivingRepository.markVoided).toHaveBeenCalled();
    });

    it('reverses only the lines still active', async () => {
      receivingRepository.findForCorrection.mockResolvedValue(posted({
        items: [
          { id: firstItemId, productId: firstId, quantity: 2, status: SupplierReceivingItemStatus.REVERSED, stockMovementId: 'movement-1' },
          { id: secondItemId, productId: secondId, quantity: 3, status: SupplierReceivingItemStatus.ACTIVE, stockMovementId: 'movement-2' },
        ],
      }));
      await SupplierReceivingsService.void(receivingId, voidInput, admin);
      expect(inventoryRepository.createMovement).toHaveBeenCalledTimes(1);
      expect(receivingRepository.reverseItem).toHaveBeenCalledWith(secondItemId, expect.any(Object), tx);
    });

    it('refuses an employee before touching the document', async () => {
      await expect(SupplierReceivingsService.void(receivingId, voidInput, user)).rejects.toMatchObject({ statusCode: 403 });
      expect(receivingRepository.findForCorrection).not.toHaveBeenCalled();
      expect(verifyAdminPassword).not.toHaveBeenCalled();
    });

    it('stops when the account password fails, before any stock moves', async () => {
      verifyAdminPassword.mockRejectedValueOnce(Object.assign(new Error('Account password is incorrect'), { statusCode: 401 }));
      await expect(SupplierReceivingsService.void(receivingId, voidInput, admin)).rejects.toThrow('Account password is incorrect');
      expect(inventoryRepository.compareAndSetQuantity).not.toHaveBeenCalled();
      expect(receivingRepository.markVoided).not.toHaveBeenCalled();
    });

    it('refuses when stock tracking was turned off for one of the products', async () => {
      inventoryRepository.findProduct.mockImplementation(async (id: string) => ({ ...product(id, 10), trackStock: id === secondId ? false : true }));
      await expect(SupplierReceivingsService.void(receivingId, voidInput, admin)).rejects.toMatchObject({ code: 'STOCK_TRACKING_DISABLED', statusCode: 409 });
      expect(inventoryRepository.compareAndSetQuantity).not.toHaveBeenCalled();
    });
  });
});
