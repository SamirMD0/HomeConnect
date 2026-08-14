import { Role, StockMovementType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = { id: 'tx' };
const { receivingRepository, inventoryRepository } = vi.hoisted(() => ({
  receivingRepository: { findSupplier: vi.fn(), create: vi.fn(), createItem: vi.fn(), findById: vi.fn(), findDuplicate: vi.fn(), list: vi.fn() },
  inventoryRepository: { findProduct: vi.fn(), findOpeningBalance: vi.fn(), compareAndSetQuantity: vi.fn(), createMovement: vi.fn() },
}));
vi.mock('./supplier-receivings.repository', () => ({ SupplierReceivingsRepository: receivingRepository }));
vi.mock('../inventory.repository', () => ({ InventoryRepository: inventoryRepository }));
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
