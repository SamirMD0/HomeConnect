import { LabelBarcodeSource, Prisma, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository, pricing, writeAudit, verify, tx } = vi.hoisted(() => {
  const transaction = { user: { findUnique: vi.fn().mockResolvedValue({ fullName: 'Admin User', username: 'admin' }) } };
  return {
    repository: {
      findByBarcode: vi.fn(), findBySku: vi.fn(), findDuplicates: vi.fn(), findPricingPreset: vi.fn(), create: vi.fn(),
      findActiveDefaultPricingPreset: vi.fn(), findById: vi.fn(), update: vi.fn(), deleteImage: vi.fn(),
      groupBrandSpellings: vi.fn(), list: vi.fn(),
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

import { ProductsService, summarizeProductBrands } from './products.service';

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
    repository.findBySku.mockResolvedValue(null);
    repository.findDuplicates.mockResolvedValue({ sameNameModel: [], sameModelBrand: [] });
    repository.findPricingPreset.mockResolvedValue(null);
    repository.findActiveDefaultPricingPreset.mockResolvedValue(null);
    repository.list.mockResolvedValue({ items: [], total: 0 });
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

  it('persists admin-supplied create-time stock settings at quantity zero and audits the intent', async () => {
    const created = await ProductsService.create({
      name: 'Tracked fan', model: 'TF-1', trackStock: true, lowStockThreshold: 3,
    }, user, context);

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      trackStock: true, lowStockThreshold: 3,
    }), expect.anything());
    expect(repository.create.mock.calls[0][0]).not.toHaveProperty('stockQuantity');
    expect(created).toMatchObject({ trackStock: true, stockQuantity: 0, lowStockThreshold: 3 });
    expect(writeAudit.mock.calls[0][0].afterValues).toMatchObject({
      trackStock: true, stockQuantity: 0, lowStockThreshold: 3,
    });
  });

  it('keeps create-time stock settings admin-only without blocking a plain employee create', async () => {
    await expect(ProductsService.create({ name: 'Plain fan', model: 'PF-1' }, employee, context))
      .resolves.toMatchObject({ name: 'Plain fan', trackStock: false, stockQuantity: 0 });
    await expect(ProductsService.create({ name: 'Tracked fan', model: 'TF-1', trackStock: true }, employee, context))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(ProductsService.create({ name: 'Threshold fan', model: 'TH-1', lowStockThreshold: 2 }, employee, context))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(repository.create).toHaveBeenCalledTimes(1);
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

  it('adds list-only not-in-inventory truth and keeps it off the detail response', async () => {
    repository.list.mockResolvedValue({
      items: [
        productOf({ id: 'outside', _count: { stockMovements: 0 }, trackStock: false, stockQuantity: 0 }),
        productOf({ id: 'has-movement', _count: { stockMovements: 1 }, trackStock: false, stockQuantity: 0 }),
        productOf({ id: 'tracked', _count: { stockMovements: 0 }, trackStock: true, stockQuantity: 0 }),
        productOf({ id: 'has-quantity', _count: { stockMovements: 0 }, trackStock: false, stockQuantity: 2 }),
      ],
      total: 4,
    });
    const list = await ProductsService.list({
      isActive: undefined,
      hasBarcode: undefined,
      trackStock: undefined,
      sortBy: 'name',
      sortOrder: 'asc',
      page: 1,
      pageSize: 25,
    }, employee);
    expect(list.items.map((item) => [item.id, item.notInInventory])).toEqual([
      ['outside', true], ['has-movement', false], ['tracked', false], ['has-quantity', false],
    ]);

    repository.findById.mockResolvedValue(productOf({ id: 'outside' }));
    const detail = await ProductsService.get('outside', employee);
    expect(detail).not.toHaveProperty('notInInventory');
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

describe('product brand summaries', () => {
  it('groups case variants, collapses whitespace, and chooses the majority spelling', () => {
    expect(summarizeProductBrands([
      { brand: 'Kozano', _count: { _all: 12 } },
      { brand: 'KOZANO', _count: { _all: 5 } },
      { brand: 'kozano', _count: { _all: 3 } },
      { brand: '  Silver   Crest ', _count: { _all: 2 } },
      { brand: 'silver crest', _count: { _all: 1 } },
    ])).toEqual([
      { canonical: 'Kozano', productCount: 20, spellings: ['Kozano', 'KOZANO', 'kozano'], spellingCounts: [{ spelling: 'Kozano', productCount: 12 }, { spelling: 'KOZANO', productCount: 5 }, { spelling: 'kozano', productCount: 3 }] },
      { canonical: 'Silver Crest', productCount: 3, spellings: ['Silver Crest', 'silver crest'], spellingCounts: [{ spelling: 'Silver Crest', productCount: 2 }, { spelling: 'silver crest', productCount: 1 }] },
    ]);
  });

  it('resolves a usage tie to Title Case deterministically', () => {
    expect(summarizeProductBrands([
      { brand: 'KENWOOD', _count: { _all: 2 } },
      { brand: 'Kenwood', _count: { _all: 2 } },
      { brand: 'kenwood', _count: { _all: 2 } },
    ])[0]).toEqual({ canonical: 'Kenwood', productCount: 6, spellings: ['Kenwood', 'kenwood', 'KENWOOD'], spellingCounts: [{ spelling: 'Kenwood', productCount: 2 }, { spelling: 'kenwood', productCount: 2 }, { spelling: 'KENWOOD', productCount: 2 }] });
  });

  it('excludes null, empty, and whitespace-only brand values', () => {
    expect(summarizeProductBrands([
      { brand: null, _count: { _all: 3 } },
      { brand: '', _count: { _all: 2 } },
      { brand: '   ', _count: { _all: 1 } },
    ])).toEqual([]);
  });

  it('keeps prefix-sharing brands in separate groups', () => {
    const summaries = summarizeProductBrands([
      { brand: 'Mac', _count: { _all: 1 } },
      { brand: 'MAC Styler', _count: { _all: 1 } },
      { brand: 'GENERAL', _count: { _all: 1 } },
      { brand: 'General Pro', _count: { _all: 1 } },
      { brand: 'General Gold', _count: { _all: 1 } },
      { brand: 'GENERAL OCEAN', _count: { _all: 1 } },
    ]);

    expect(summaries.map((brand) => brand.canonical)).toEqual(expect.arrayContaining([
      'Mac', 'MAC Styler', 'GENERAL', 'General Pro', 'General Gold', 'GENERAL OCEAN',
    ]));
    expect(summaries).toHaveLength(6);
  });

  it('returns only grouped brand fields from the repository aggregate', async () => {
    repository.groupBrandSpellings.mockResolvedValue([{ brand: 'DSP', _count: { _all: 30 } }]);
    await expect(ProductsService.brands()).resolves.toEqual({
      brands: [{ canonical: 'DSP', productCount: 30, spellings: ['DSP'], spellingCounts: [{ spelling: 'DSP', productCount: 30 }] }],
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

  it('keeps case-insensitive SKU collision enforcement authoritative on save', async () => {
    repository.findBySku.mockResolvedValue(productOf({ id: '99999999-9999-4999-8999-999999999999', sku: 'HC-009999' }));

    await expect(ProductsService.updateSku(productId, { sku: 'HC-009999' }, user, context))
      .rejects.toMatchObject({ statusCode: 409, details: { field: 'sku' } });
    expect(repository.findBySku).toHaveBeenCalledWith('HC-009999', expect.anything(), {
      caseInsensitive: true,
      excludeProductId: productId,
    });
    expect(repository.update).not.toHaveBeenCalled();
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

  it('classifies every duplicate reason, excludes the subject, and serializes catalogue fields only', async () => {
    const subjectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const barcode = productOf({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Barcode owner', barcode: 'AbC-1234' });
    const sku = productOf({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'SKU owner', sku: 'HC-009999' });
    const sameName = productOf({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Fan', model: 'F1', brand: 'Ariete' });
    const sameModelBrand = productOf({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Fan Deluxe', model: 'F1', brand: 'Ariete' });
    repository.findByBarcode.mockResolvedValue(barcode);
    repository.findBySku.mockResolvedValue(sku);
    repository.findDuplicates.mockResolvedValue({
      sameNameModel: [productOf({ id: subjectId }), sameName],
      sameModelBrand: [sameModelBrand, productOf({ id: subjectId })],
    });

    const result = await ProductsService.checkDuplicate({
      name: 'fAn', model: 'f1', brand: 'aRiEtE', barcode: 'aBc-1234', sku: 'hc-009999', excludeProductId: subjectId,
    });

    expect(result.matches.map((match) => match.reason)).toEqual(expect.arrayContaining([
      'BARCODE_TAKEN', 'SKU_TAKEN', 'SAME_NAME_MODEL', 'SAME_MODEL_BRAND',
    ]));
    expect(result.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: barcode.id, reason: 'BARCODE_TAKEN' }),
      expect.objectContaining({ id: sku.id, reason: 'SKU_TAKEN' }),
      expect.objectContaining({ id: sameName.id, reason: 'SAME_NAME_MODEL' }),
      expect.objectContaining({ id: sameModelBrand.id, reason: 'SAME_MODEL_BRAND' }),
    ]));
    expect(result.matches.some((match) => match.id === subjectId)).toBe(false);
    expect(repository.findByBarcode).toHaveBeenCalledWith('aBc-1234', undefined, { caseInsensitive: true, excludeProductId: subjectId });
    expect(repository.findBySku).toHaveBeenCalledWith('HC-009999', undefined, { caseInsensitive: true, excludeProductId: subjectId });
    expect(repository.findDuplicates).toHaveBeenCalledWith(expect.objectContaining({
      name: 'fAn', model: 'f1', brand: 'aRiEtE', excludeProductId: subjectId,
    }));
    for (const match of result.matches) {
      expect(Object.keys(match).sort()).toEqual(['barcode', 'brand', 'id', 'isActive', 'model', 'name', 'reason', 'sku']);
      for (const forbidden of ['price', 'costPrice', 'discount', 'stockQuantity', 'notes']) {
        expect(JSON.stringify(match)).not.toContain(`"${forbidden}"`);
      }
    }
  });

  it('caps duplicate results at five with active products first and newest updates first', async () => {
    const candidates = Array.from({ length: 7 }, (_, index) => productOf({
      id: `00000000-0000-4000-8000-00000000000${index}`,
      name: `Fan ${index}`,
      isActive: index >= 3,
      updatedAt: new Date(`2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`),
    }));
    repository.findDuplicates.mockResolvedValue({ sameNameModel: candidates, sameModelBrand: [] });

    const result = await ProductsService.checkDuplicate({ name: 'Fan', model: 'F1' });

    expect(result.matches).toHaveLength(5);
    expect(result.matches.slice(0, 4).every((match) => match.isActive)).toBe(true);
    expect(result.matches.slice(0, 4).map((match) => match.name)).toEqual(['Fan 6', 'Fan 5', 'Fan 4', 'Fan 3']);
  });
});
