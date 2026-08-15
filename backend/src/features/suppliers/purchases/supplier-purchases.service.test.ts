import { Role, StockMovementType, SupplierPurchaseLineKind, SupplierTransactionDirection, SupplierTransactionType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = { id: 'tx', user: { findUnique: vi.fn() } };
const {
  suppliersRepository, transactionsRepository, purchasesRepository, inventoryRepository,
  productsRepository, receiving, audits, adminVerification, sku,
} = vi.hoisted(() => ({
  suppliersRepository: { findById: vi.fn() },
  transactionsRepository: { create: vi.fn() },
  purchasesRepository: { createLine: vi.fn(), findById: vi.fn(), listForSupplier: vi.fn(), findReceiptMatches: vi.fn() },
  inventoryRepository: { findProduct: vi.fn(), createMovement: vi.fn() },
  productsRepository: { create: vi.fn(), findByBarcode: vi.fn() },
  receiving: { postSupplierReceiving: vi.fn(), assertReceivingDateNotFuture: vi.fn() },
  audits: { writeSupplierAudit: vi.fn(), writeServiceAudit: vi.fn() },
  adminVerification: { verifyAdminPassword: vi.fn() },
  sku: { generateProductSku: vi.fn() },
}));

vi.mock('../suppliers/suppliers.repository', () => ({ SuppliersRepository: suppliersRepository }));
vi.mock('../transactions/supplier-transactions.repository', () => ({ SupplierTransactionsRepository: transactionsRepository }));
vi.mock('./supplier-purchases.repository', () => ({ SupplierPurchasesRepository: purchasesRepository }));
vi.mock('../../inventory/inventory.repository', () => ({ InventoryRepository: inventoryRepository }));
vi.mock('../../service/products/products.repository', () => ({ ProductsRepository: productsRepository }));
vi.mock('../../inventory/receiving/supplier-receivings.service', () => receiving);
vi.mock('../audit/supplier-audit', () => ({ writeSupplierAudit: audits.writeSupplierAudit }));
vi.mock('../../service/audit/service-audit', () => ({ writeServiceAudit: audits.writeServiceAudit }));
vi.mock('../../../lib/admin-verification', () => adminVerification);
vi.mock('../../service/products/product-sku', () => sku);
vi.mock('../../financial/infrastructure/transaction', () => ({
  runFinancialTransaction: vi.fn((operation: (client: unknown) => unknown) => operation(tx)),
}));

import { SupplierPurchasesService } from './supplier-purchases.service';

const admin = { userId: '11111111-1111-4111-8111-111111111111', role: Role.ADMIN };
const context = { requestId: 'req-1', ipAddress: '127.0.0.1' };
const supplierId = '22222222-2222-4222-8222-222222222222';
const productId = '33333333-3333-4333-8333-333333333333';
const transactionId = '44444444-4444-4444-8444-444444444444';
const receivingId = '55555555-5555-4555-8555-555555555555';
const itemId = '66666666-6666-4666-8666-666666666666';

const today = () => new Date().toISOString().slice(0, 10);
const productLine = (overrides = {}) => ({ kind: 'EXISTING_PRODUCT' as const, productId, quantity: 3, unitPrice: '210.00', ...overrides });
const purchase = (overrides: Record<string, unknown> = {}) => ({
  receiptNumber: 'INV-2291',
  transactionDate: today(),
  description: 'TCL AC purchase',
  reference: null,
  notes: null,
  receiveStock: true,
  amountOverride: null,
  amountOverrideReason: null,
  lines: [productLine()],
  ...overrides,
});

describe('SupplierPurchasesService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BUSINESS_TIMEZONE = 'Asia/Beirut';
    tx.user.findUnique.mockResolvedValue({ fullName: 'Owner', username: 'owner' });
    suppliersRepository.findById.mockResolvedValue({ id: supplierId, name: 'TCL Distributor', isActive: true });
    inventoryRepository.findProduct.mockResolvedValue({ id: productId, sku: 'HC-000042', name: 'TCL AC 1.5HP', isActive: true, trackStock: true, stockQuantity: 4, lowStockThreshold: null });
    receiving.postSupplierReceiving.mockResolvedValue({ receivingId, itemIdByProductId: new Map([[productId, itemId]]) });
    transactionsRepository.create.mockResolvedValue({ id: transactionId });
    purchasesRepository.createLine.mockResolvedValue({});
    purchasesRepository.findById.mockResolvedValue({
      id: transactionId, amount: '630.00', transactionDate: new Date('2026-08-15T00:00:00.000Z'),
      supplierReceiving: null, purchaseLines: [],
    });
  });

  it('posts one receiving and one debt for the line total, linking each stock line to the item that moved it', async () => {
    await SupplierPurchasesService.create(supplierId, purchase(), admin, context);

    expect(receiving.postSupplierReceiving).toHaveBeenCalledTimes(1);
    expect(receiving.postSupplierReceiving).toHaveBeenCalledWith(expect.objectContaining({
      supplier: expect.objectContaining({ id: supplierId }),
      referenceNumber: 'INV-2291',
      items: [{ productId, quantity: 3 }],
      userId: admin.userId,
    }), tx);

    expect(transactionsRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      supplierId,
      supplierReceivingId: receivingId,
      type: SupplierTransactionType.SUPPLIER_DEBT,
      direction: SupplierTransactionDirection.INCREASE_OWED,
      receiptNumber: 'INV-2291',
      amountOverride: false,
    }), tx);
    expect(transactionsRepository.create.mock.calls[0][0].amount.toFixed(2)).toBe('630.00');

    expect(purchasesRepository.createLine).toHaveBeenCalledWith(expect.objectContaining({
      kind: SupplierPurchaseLineKind.PRODUCT, productId, quantity: 3, receivingItemId: itemId, position: 0,
    }), tx);
  });

  it('keeps stock writing inside the shared receiving function and never touches quantities itself', async () => {
    await SupplierPurchasesService.create(supplierId, purchase(), admin, context);
    // The only movement this service may write itself is a quick-add opening
    // count; a purchase of an existing product must write none.
    expect(inventoryRepository.createMovement).not.toHaveBeenCalled();
  });

  it('creates no receiving at all for a manual-description purchase', async () => {
    await SupplierPurchasesService.create(supplierId, purchase({
      lines: [{ kind: 'MANUAL', description: 'Delivery to shop', amount: '25.00' }],
    }), admin, context);

    expect(receiving.postSupplierReceiving).not.toHaveBeenCalled();
    expect(transactionsRepository.create).toHaveBeenCalledWith(expect.objectContaining({ supplierReceivingId: null }), tx);
    expect(purchasesRepository.createLine).toHaveBeenCalledWith(expect.objectContaining({
      kind: SupplierPurchaseLineKind.MANUAL, productId: null, quantity: null, unitPrice: null, receivingItemId: null,
    }), tx);
  });

  it('records a priced debt with no stock movement when the goods have not arrived', async () => {
    await SupplierPurchasesService.create(supplierId, purchase({ receiveStock: false }), admin, context);

    expect(receiving.postSupplierReceiving).not.toHaveBeenCalled();
    expect(purchasesRepository.createLine).toHaveBeenCalledWith(expect.objectContaining({
      kind: SupplierPurchaseLineKind.PRODUCT, productId, receivingItemId: null,
    }), tx);
  });

  it('sums mixed product and manual lines into one debt amount', async () => {
    await SupplierPurchasesService.create(supplierId, purchase({
      lines: [productLine(), { kind: 'MANUAL', description: 'Freight', amount: '25.50' }],
    }), admin, context);
    expect(transactionsRepository.create.mock.calls[0][0].amount.toFixed(2)).toBe('655.50');
    expect(purchasesRepository.createLine).toHaveBeenCalledTimes(2);
  });

  it('honours an override total while still storing the line sum on the audit', async () => {
    await SupplierPurchasesService.create(supplierId, purchase({
      amountOverride: '600.00', amountOverrideReason: 'Supplier applied a bulk discount',
    }), admin, context);

    expect(transactionsRepository.create.mock.calls[0][0].amount.toFixed(2)).toBe('600.00');
    expect(transactionsRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      amountOverride: true, amountOverrideReason: 'Supplier applied a bulk discount',
    }), tx);
    expect(audits.writeSupplierAudit).toHaveBeenCalledWith(expect.objectContaining({
      afterValues: expect.objectContaining({ amount: '600.00', lineSum: '630.00', amountOverride: true }),
    }), tx);
  });

  it('rejects a zero-value purchase rather than posting a debt of nothing', async () => {
    await expect(SupplierPurchasesService.create(supplierId, purchase({
      lines: [productLine({ unitPrice: '0' })],
    }), admin, context)).rejects.toMatchObject({ statusCode: 400 });
    expect(transactionsRepository.create).not.toHaveBeenCalled();
  });

  it('allows a zero-priced bonus line as long as the purchase total is positive', async () => {
    await SupplierPurchasesService.create(supplierId, purchase({
      lines: [productLine(), { kind: 'MANUAL', description: 'Bonus unit', amount: '0.01' }],
    }), admin, context);
    expect(transactionsRepository.create).toHaveBeenCalled();
  });

  it('refuses a non-admin before reading anything', async () => {
    await expect(SupplierPurchasesService.create(supplierId, purchase(), { ...admin, role: Role.EMPLOYEE }, context))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(suppliersRepository.findById).not.toHaveBeenCalled();
  });

  it('refuses an archived or unknown supplier before any write', async () => {
    suppliersRepository.findById.mockResolvedValueOnce({ id: supplierId, name: 'Old', isActive: false });
    await expect(SupplierPurchasesService.create(supplierId, purchase(), admin, context)).rejects.toMatchObject({ code: 'SUPPLIER_ARCHIVED' });
    suppliersRepository.findById.mockResolvedValueOnce(null);
    await expect(SupplierPurchasesService.create(supplierId, purchase(), admin, context)).rejects.toMatchObject({ statusCode: 404 });
    expect(transactionsRepository.create).not.toHaveBeenCalled();
    expect(receiving.postSupplierReceiving).not.toHaveBeenCalled();
  });

  it('refuses to receive a product that does not track stock instead of billing it silently', async () => {
    inventoryRepository.findProduct.mockResolvedValueOnce({ id: productId, sku: 'HC-000042', name: 'Install kit', isActive: true, trackStock: false, stockQuantity: 0, lowStockThreshold: null });
    await expect(SupplierPurchasesService.create(supplierId, purchase(), admin, context)).rejects.toThrow('Stock tracking is disabled');
    expect(transactionsRepository.create).not.toHaveBeenCalled();
    expect(receiving.postSupplierReceiving).not.toHaveBeenCalled();
  });

  it('propagates a receiving failure without writing the ledger', async () => {
    receiving.postSupplierReceiving.mockRejectedValueOnce(Object.assign(new Error('Stock changed'), { code: 'STOCK_CHANGED' }));
    await expect(SupplierPurchasesService.create(supplierId, purchase(), admin, context)).rejects.toThrow('Stock changed');
    expect(transactionsRepository.create).not.toHaveBeenCalled();
    expect(purchasesRepository.createLine).not.toHaveBeenCalled();
  });
});

describe('SupplierPurchasesService quick add', () => {
  const newProductId = '77777777-7777-4777-8777-777777777777';
  const quickAddLine = { kind: 'NEW_PRODUCT' as const, name: 'TCL AC 2HP', model: 'TAC-24', barcode: null, brand: null, sellingPrice: null, quantity: 2, unitPrice: '300.00' };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BUSINESS_TIMEZONE = 'Asia/Beirut';
    tx.user.findUnique.mockResolvedValue({ fullName: 'Owner', username: 'owner' });
    suppliersRepository.findById.mockResolvedValue({ id: supplierId, name: 'TCL Distributor', isActive: true });
    sku.generateProductSku.mockResolvedValue('HC-000099');
    productsRepository.findByBarcode.mockResolvedValue(null);
    productsRepository.create.mockResolvedValue({ id: newProductId, sku: 'HC-000099', name: 'TCL AC 2HP', model: 'TAC-24', barcode: null, brand: null, price: null });
    inventoryRepository.findProduct.mockResolvedValue({ id: newProductId, sku: 'HC-000099', name: 'TCL AC 2HP', isActive: true, trackStock: true, stockQuantity: 0, lowStockThreshold: null });
    inventoryRepository.createMovement.mockResolvedValue({ id: 'movement' });
    receiving.postSupplierReceiving.mockResolvedValue({ receivingId, itemIdByProductId: new Map([[newProductId, itemId]]) });
    transactionsRepository.create.mockResolvedValue({ id: transactionId });
    purchasesRepository.createLine.mockResolvedValue({});
    purchasesRepository.findById.mockResolvedValue({ id: transactionId, amount: '600.00', transactionDate: new Date('2026-08-15T00:00:00.000Z'), supplierReceiving: null, purchaseLines: [] });
  });

  it('verifies the admin password before creating anything', async () => {
    await SupplierPurchasesService.create(supplierId, purchase({ lines: [quickAddLine], accountPassword: 'secret' }), admin, context);

    expect(adminVerification.verifyAdminPassword).toHaveBeenCalledWith(
      admin.userId, 'secret',
      expect.objectContaining({ action: 'QUICK_ADD_PRODUCT_FROM_PURCHASE' }),
      tx
    );
    expect(adminVerification.verifyAdminPassword.mock.invocationCallOrder[0])
      .toBeLessThan(productsRepository.create.mock.invocationCallOrder[0]);
  });

  it('writes an observed zero opening count rather than skipping onboarding', async () => {
    await SupplierPurchasesService.create(supplierId, purchase({ lines: [quickAddLine], accountPassword: 'secret' }), admin, context);

    expect(productsRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      sku: 'HC-000099', name: 'TCL AC 2HP', model: 'TAC-24', trackStock: true, stockQuantity: 0,
    }), tx);
    expect(inventoryRepository.createMovement).toHaveBeenCalledWith(expect.objectContaining({
      productId: newProductId,
      movementType: StockMovementType.OPENING_BALANCE,
      quantityChange: 0, quantityBefore: 0, quantityAfter: 0,
    }), tx);
    // Onboarding must be visible in the product's own audit trail, not only the
    // supplier ledger's.
    expect(audits.writeServiceAudit).toHaveBeenCalledWith(expect.objectContaining({
      recordId: newProductId, afterValues: expect.objectContaining({ trackStock: true, stockQuantity: 0 }),
    }), tx);
  });

  it('onboards the product before the receiving that depends on it', async () => {
    await SupplierPurchasesService.create(supplierId, purchase({ lines: [quickAddLine], accountPassword: 'secret' }), admin, context);
    expect(inventoryRepository.createMovement.mock.invocationCallOrder[0])
      .toBeLessThan(receiving.postSupplierReceiving.mock.invocationCallOrder[0]);
  });

  it('refuses a barcode that already belongs to another product', async () => {
    productsRepository.findByBarcode.mockResolvedValueOnce({ id: 'other' });
    await expect(SupplierPurchasesService.create(supplierId, purchase({
      lines: [{ ...quickAddLine, barcode: 'ABC-1234' }], accountPassword: 'secret',
    }), admin, context)).rejects.toMatchObject({ code: 'PRODUCT_BARCODE_CONFLICT' });
    expect(productsRepository.create).not.toHaveBeenCalled();
  });

  it('never onboards a product when password verification fails', async () => {
    adminVerification.verifyAdminPassword.mockRejectedValueOnce(Object.assign(new Error('Account password is incorrect'), { statusCode: 401 }));
    await expect(SupplierPurchasesService.create(supplierId, purchase({ lines: [quickAddLine], accountPassword: 'wrong' }), admin, context)).rejects.toThrow('incorrect');
    expect(productsRepository.create).not.toHaveBeenCalled();
    expect(inventoryRepository.createMovement).not.toHaveBeenCalled();
    expect(transactionsRepository.create).not.toHaveBeenCalled();
  });
});

describe('SupplierPurchasesService.receiptCheck', () => {
  beforeEach(() => vi.clearAllMocks());

  it('warns about a reused receipt number without blocking anything', async () => {
    purchasesRepository.findReceiptMatches.mockResolvedValue([
      { id: transactionId, receiptNumber: 'INV-2291', amount: '630.00', transactionDate: new Date('2026-08-14T00:00:00.000Z'), description: 'TCL AC purchase' },
    ]);
    await expect(SupplierPurchasesService.receiptCheck({ supplierId, receiptNumber: 'INV-2291' })).resolves.toMatchObject({
      duplicate: true,
      matches: [expect.objectContaining({ amount: '630.00', transactionDate: '2026-08-14' })],
    });
  });

  it('reports no duplicate when the receipt is new', async () => {
    purchasesRepository.findReceiptMatches.mockResolvedValue([]);
    await expect(SupplierPurchasesService.receiptCheck({ supplierId, receiptNumber: 'INV-1' })).resolves.toMatchObject({ duplicate: false, matches: [] });
  });
});
