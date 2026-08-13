import { LabelBarcodeSource, Prisma, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository, pricing, writeAudit, verify, tx } = vi.hoisted(() => {
  const transaction = { user: { findUnique: vi.fn().mockResolvedValue({ fullName: 'Admin User', username: 'admin' }) } };
  return {
    repository: {
      findByBarcode: vi.fn(), findPricingPreset: vi.fn(), create: vi.fn(),
      findActiveDefaultPricingPreset: vi.fn(), findById: vi.fn(), update: vi.fn(), deleteImage: vi.fn(),
    },
    pricing: { resolveProductPricing: vi.fn() },
    writeAudit: vi.fn(), verify: vi.fn(), tx: transaction,
  };
});

vi.mock('./products.repository', () => ({ ProductsRepository: repository }));
vi.mock('../../pricing/calculator/pricing-resolution', () => ({ resolveProductPricing: pricing.resolveProductPricing }));
vi.mock('../audit/service-audit', () => ({ writeServiceAudit: writeAudit }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verify }));
vi.mock('../../financial/infrastructure/transaction', () => ({ runFinancialTransaction: (operation: (client: unknown) => unknown) => operation(tx) }));
vi.mock('./product-sku', () => ({ generateProductSku: vi.fn().mockResolvedValue('HC-000001') }));
vi.mock('../../../lib/prisma', () => ({ prisma: {}, transactionModel: {}, activityLogModel: {} }));

import { ProductsService } from './products.service';

const user = { userId: '11111111-1111-4111-8111-111111111111', role: Role.ADMIN, username: 'admin' };
const employee = { ...user, role: Role.EMPLOYEE };
const context = { requestId: 'request-1', ipAddress: '127.0.0.1' };
const money = (value: string) => new Prisma.Decimal(value);

const productOf = (overrides: Record<string, unknown> = {}) => ({
  id: '22222222-2222-4222-8222-222222222222', sku: 'HC-000001', name: 'Fan', model: 'F1',
  barcode: null, brand: null, price: null, discount: null, costPrice: null, pricingPresetId: null,
  useCustomPricing: false, installmentEnabled: false, customExpensePercent: null,
  customProfitPercent: null, customDiscountBufferPercent: null, customInstallmentMarkupPercent: null,
  customDownPaymentPercent: null, customInstallmentMonths: null, customCalculationMode: null,
  imageUrl: null, isActive: true, notes: null, labelBarcodeSource: LabelBarcodeSource.AUTO,
  trackStock: false, stockQuantity: 0, lowStockThreshold: null, specifications: [], specificationNotes: null,
  createdById: user.userId, updatedById: null, createdAt: new Date('2026-08-05T00:00:00Z'), updatedAt: new Date('2026-08-05T00:00:00Z'),
  pricingPreset: null, image: null, createdBy: { fullName: 'Admin User', username: 'admin' }, updatedBy: null,
  ...overrides,
});

const unavailable = { pricingAvailable: false, reason: 'MISSING_COST_PRICE' };
const available = {
  pricingAvailable: true, source: 'PRESET', preset: null, cashPrice: '120.00', internalPriceCode: 'P100', warnings: [],
  inputs: { costPrice: '100.00' },
  installment: { installmentPrice: '120.00', downPayment: '120.00', remaining: '0.00', monthlyPayment: '0.00', lastInstallmentPayment: '0.00', installmentMonths: 1 },
};

describe('product service workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findByBarcode.mockResolvedValue(null);
    repository.findPricingPreset.mockResolvedValue(null);
    repository.findActiveDefaultPricingPreset.mockResolvedValue(null);
    pricing.resolveProductPricing.mockReturnValue(unavailable);
    repository.create.mockImplementation((data) => Promise.resolve(productOf({ ...data })));
    repository.update.mockImplementation((_id, data) => Promise.resolve(productOf({ ...data })));
  });

  it('persists an image URL on create, returns it after a fresh get, and audits it', async () => {
    const imageUrl = 'https://cdn.example.com/fan.png';
    const created = await ProductsService.create({ name: 'Fan', model: 'F1', imageUrl }, employee, context);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ imageUrl }), expect.anything());
    expect(created).toMatchObject({ imageUrl, image: { source: 'URL', url: imageUrl } });
    expect(writeAudit.mock.calls[0][0].afterValues).toMatchObject({ imageUrl });

    repository.findById.mockResolvedValue(productOf({ imageUrl }));
    await expect(ProductsService.get(created.id, employee)).resolves.toMatchObject({ imageUrl });
  });

  it('does not treat false pricing booleans as an admin-only create', async () => {
    await expect(ProductsService.create({ name: 'Fan', model: 'F1', useCustomPricing: false, installmentEnabled: false }, employee, context)).resolves.toMatchObject({ name: 'Fan' });
  });

  it('updates imageUrl only when supplied and returns resolved pricing from PATCH', async () => {
    const existing = productOf({ costPrice: money('100.00') });
    repository.findById.mockResolvedValue(existing);
    repository.update.mockImplementation((_id, data) => Promise.resolve({ ...existing, ...data }));
    pricing.resolveProductPricing.mockReturnValue(available);

    const notesOnly = await ProductsService.update(existing.id, { notes: 'New note' }, employee, context);
    expect(repository.update.mock.calls[0][1]).not.toHaveProperty('imageUrl');
    expect(notesOnly.pricing).toMatchObject({ pricingAvailable: true, mode: 'PRESET', cashPrice: '120.00' });

    const imageUrl = 'https://cdn.example.com/new.png';
    await ProductsService.update(existing.id, { imageUrl }, employee, context);
    expect(repository.update.mock.calls[1][1]).toMatchObject({ imageUrl });
  });

  it.each([
    [{ costPrice: money('100.00'), useCustomPricing: true }, 'CUSTOM'],
    [{ costPrice: money('100.00'), useCustomPricing: false }, 'PRESET'],
    [{ costPrice: null, price: money('125.00') }, 'MANUAL'],
    [{ costPrice: null, price: null }, 'NONE'],
  ])('derives pricing mode from raw columns', async (overrides, mode) => {
    const record = productOf(overrides);
    repository.findById.mockResolvedValue(record);
    pricing.resolveProductPricing.mockReturnValue(record.costPrice ? available : unavailable);
    await expect(ProductsService.get(record.id, user)).resolves.toMatchObject({ pricing: { mode } });
  });

  it('serializes a manual-only price as a Decimal-safe string', async () => {
    repository.findById.mockResolvedValue(productOf({ price: money('125.00') }));
    await expect(ProductsService.get('22222222-2222-4222-8222-222222222222', user)).resolves.toMatchObject({
      price: '125.00', pricing: { mode: 'MANUAL' },
    });
  });

  it('rejects clearing a persisted manufacturer barcode', async () => {
    const existing = productOf({ labelBarcodeSource: LabelBarcodeSource.MANUFACTURER, barcode: 'ABCD-1234' });
    repository.findById.mockResolvedValue(existing);
    await expect(ProductsService.update(existing.id, { barcode: null }, user, context))
      .rejects.toMatchObject({ details: { field: 'barcode' } });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('clears stored installment overrides when installments are turned off', async () => {
    const existing = productOf({
      costPrice: money('100.00'), useCustomPricing: true, installmentEnabled: true,
      customExpensePercent: new Prisma.Decimal('5'), customProfitPercent: new Prisma.Decimal('20'),
      customDiscountBufferPercent: new Prisma.Decimal('5'), customCalculationMode: 'COMPOUND',
      customInstallmentMarkupPercent: new Prisma.Decimal('10'), customDownPaymentPercent: new Prisma.Decimal('30'), customInstallmentMonths: 12,
    });
    repository.findById.mockResolvedValue(existing);
    repository.update.mockImplementation((_id, data) => Promise.resolve({ ...existing, ...data }));
    pricing.resolveProductPricing.mockReturnValue(available);

    await ProductsService.updatePricing(existing.id, { installmentEnabled: false, reason: 'Disable installment option', accountPassword: 'secret' }, user, context);

    expect(repository.update.mock.calls[0][1]).toMatchObject({
      installmentEnabled: false, customInstallmentMarkupPercent: null,
      customDownPaymentPercent: null, customInstallmentMonths: null,
    });
  });
});

// v1.8.1 removed the account-password re-check and the typed reason from normal
// product editing. The role boundary did NOT move, in either direction, and the
// audit row is still written — these tests are what prove both.
describe('product edit security policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.user.findUnique.mockResolvedValue({ fullName: 'Admin User', username: 'admin' });
    const existing = productOf();
    repository.findById.mockResolvedValue(existing);
    repository.update.mockImplementation((_id: string, data: Record<string, unknown>) => Promise.resolve({ ...existing, ...data }));
    repository.findActiveDefaultPricingPreset.mockResolvedValue(null);
    pricing.resolveProductPricing.mockReturnValue(unavailable);
  });

  const productId = '22222222-2222-4222-8222-222222222222';

  it('lets an admin edit a sensitive field without an account password', async () => {
    await ProductsService.update(productId, { name: 'Desk Fan' }, user, context);
    expect(repository.update).toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('still refuses a sensitive field to an employee', async () => {
    await expect(ProductsService.update(productId, { name: 'Desk Fan' }, employee, context)).rejects.toThrow();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('still lets an employee edit the cosmetic fields they could edit before', async () => {
    await ProductsService.update(productId, { notes: 'Back shelf' }, employee, context);
    await ProductsService.update(productId, { specifications: [{ label: 'Color', value: 'Silver' }] }, employee, context);
    expect(repository.update).toHaveBeenCalledTimes(2);
    expect(verify).not.toHaveBeenCalled();
  });

  it('generates the audit reason from the changed fields', async () => {
    await ProductsService.update(productId, { barcode: 'ABCD-1234' }, user, context);
    expect(writeAudit.mock.calls.at(-1)?.[0]).toMatchObject({ reason: 'Product barcode updated / تم تحديث باركود المنتج' });

    await ProductsService.update(productId, { specificationNotes: 'Boxed' }, user, context);
    expect(writeAudit.mock.calls.at(-1)?.[0]).toMatchObject({ reason: 'Product specifications updated / تم تحديث مواصفات المنتج' });

    await ProductsService.update(productId, { name: 'Desk Fan' }, user, context);
    expect(writeAudit.mock.calls.at(-1)?.[0]).toMatchObject({ reason: 'Product details updated / تم تحديث تفاصيل المنتج' });
  });

  it('records actor, timestamp source, action and both value snapshots on every edit', async () => {
    await ProductsService.update(productId, { name: 'Desk Fan' }, user, context);
    expect(writeAudit.mock.calls.at(-1)?.[0]).toMatchObject({
      recordType: 'PRODUCT', recordId: productId, action: 'UPDATE_DETAILS',
      changedById: user.userId, changedByName: 'Admin User', changedByUsername: 'admin',
      beforeValues: { name: 'Fan' }, afterValues: { name: 'Desk Fan' },
    });
  });

  it('changes SKU and stock settings without a password, and audits both', async () => {
    await ProductsService.updateSku(productId, { sku: 'HC-009999' }, user, context);
    expect(writeAudit.mock.calls.at(-1)?.[0]).toMatchObject({ action: 'CHANGE_SKU', reason: 'Product SKU updated / تم تحديث رمز المنتج' });

    // generateProductSku is mocked to HC-000001, so start from a different SKU.
    repository.findById.mockResolvedValue(productOf({ sku: 'HC-000002' }));
    await ProductsService.regenerateSku(productId, user, context);
    expect(writeAudit.mock.calls.at(-1)?.[0]).toMatchObject({ action: 'REGENERATE_SKU', reason: 'Product SKU regenerated / تم توليد رمز المنتج من جديد' });
    repository.findById.mockResolvedValue(productOf());

    await ProductsService.updateStock(productId, { trackStock: true, lowStockThreshold: 2 }, user, context);
    expect(writeAudit.mock.calls.at(-1)?.[0]).toMatchObject({ action: 'CHANGE_STOCK', reason: 'Product stock settings updated / تم تحديث إعدادات مخزون المنتج' });

    expect(verify).not.toHaveBeenCalled();
  });

  it('keeps SKU and stock settings admin-only', async () => {
    await expect(ProductsService.updateSku(productId, { sku: 'HC-009999' }, employee, context)).rejects.toThrow();
    await expect(ProductsService.regenerateSku(productId, employee, context)).rejects.toThrow();
    await expect(ProductsService.updateStock(productId, { trackStock: true, lowStockThreshold: 2 }, employee, context)).rejects.toThrow();
  });

  it('keeps the admin password on pricing, archive and restore', async () => {
    await ProductsService.updatePricing(productId, { costPrice: '100.00', reason: 'Supplier cost changed', accountPassword: 'secret' }, user, context);
    expect(verify).toHaveBeenCalledTimes(1);

    await ProductsService.archive(productId, { reason: 'Discontinued line', accountPassword: 'secret' }, user, context);
    expect(verify).toHaveBeenCalledTimes(2);

    repository.findById.mockResolvedValue(productOf({ isActive: false }));
    await ProductsService.restore(productId, { reason: 'Back in catalogue', accountPassword: 'secret' }, user, context);
    expect(verify).toHaveBeenCalledTimes(3);
  });
});
