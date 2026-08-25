import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository, runTransaction, writeAudit, verifyPassword, tx } = vi.hoisted(() => {
  const transaction = { user: { findUnique: vi.fn() } };
  return {
    repository: {
      findForBrandNormalization: vi.fn(),
      findExactBrandUsage: vi.fn(),
      updateBrand: vi.fn(),
    },
    runTransaction: vi.fn((operation: (client: unknown) => unknown) => operation(transaction)),
    writeAudit: vi.fn(),
    verifyPassword: vi.fn(),
    tx: transaction,
  };
});

vi.mock('./products.repository', () => ({ ProductsRepository: repository }));
vi.mock('../../financial/infrastructure/transaction', () => ({ runFinancialTransaction: runTransaction }));
vi.mock('../audit/service-audit', () => ({ writeServiceAudit: writeAudit }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verifyPassword }));
vi.mock('./product-sku', () => ({ generateProductSku: vi.fn() }));
vi.mock('../../../lib/prisma', () => ({ prisma: {}, transactionModel: {}, activityLogModel: {} }));

import { MAX_BRAND_NORMALIZE_PRODUCTS, ProductsService } from './products.service';

interface BrandProduct {
  id: string;
  sku: string;
  name: string;
  brand: string;
}

const admin = { userId: 'admin-1', username: 'admin', role: Role.ADMIN };
const employee = { ...admin, userId: 'employee-1', role: Role.EMPLOYEE };
const context = { requestId: 'brand-request-1', ipAddress: '127.0.0.1' };
const input = {
  sourceBrands: ['General', 'GENERAL'],
  targetBrand: 'General',
  reason: 'Normalize duplicate brand spelling',
  dryRun: false,
};
const row = (id: string, brand: string, name = `Product ${id}`): BrandProduct => ({ id, brand, name, sku: `HC-${id}` });

describe('product brand normalization service', () => {
  let products: BrandProduct[];

  beforeEach(() => {
    vi.clearAllMocks();
    tx.user.findUnique.mockResolvedValue({ fullName: 'Admin User', username: 'admin' });
    products = [
      row('general-title', 'General'), row('general-upper', 'GENERAL'),
      row('general-pro', 'General Pro', 'General Pro product'),
      row('general-gold', 'General Gold', 'General Gold product'),
      row('general-ocean', 'GENERAL OCEAN', 'GENERAL OCEAN product'),
      row('mac-title', 'Mac'), row('mac-upper', 'MAC'), row('mac-styler', 'MAC Styler', 'MAC Styler product'),
      row('hisense-title', 'Hisense'), row('hisense-upper', 'HISENSE'), row('hisense-tv', 'Hisense TV', 'Hisense TV product'),
    ];
    repository.findForBrandNormalization.mockImplementation((sources: string[], target: string) =>
      Promise.resolve(products.filter((product) => sources.includes(product.brand) && product.brand !== target))
    );
    repository.findExactBrandUsage.mockImplementation((brand: string) =>
      Promise.resolve(products.find((product) => product.brand === brand) ? { id: 'used' } : null)
    );
    repository.updateBrand.mockImplementation((id: string, brand: string) => {
      const product = products.find((candidate) => candidate.id === id)!;
      product.brand = brand;
      return Promise.resolve({ ...product });
    });
    writeAudit.mockResolvedValue(undefined);
  });

  it('keeps prefix-sharing brands untouched during exact-string normalization', async () => {
    await ProductsService.normalizeBrands(input, admin, context);
    await ProductsService.normalizeBrands({ ...input, sourceBrands: ['Mac', 'MAC'], targetBrand: 'Mac' }, admin, context);
    await ProductsService.normalizeBrands({ ...input, sourceBrands: ['Hisense', 'HISENSE'], targetBrand: 'Hisense' }, admin, context);

    const updatedIds = repository.updateBrand.mock.calls.map(([id]) => id);
    expect(updatedIds).toEqual(['general-upper', 'mac-upper', 'hisense-upper']);
    expect(products.find((product) => product.name === 'General Pro product')?.brand).toBe('General Pro');
    expect(products.find((product) => product.name === 'General Gold product')?.brand).toBe('General Gold');
    expect(products.find((product) => product.name === 'GENERAL OCEAN product')?.brand).toBe('GENERAL OCEAN');
    expect(products.find((product) => product.name === 'MAC Styler product')?.brand).toBe('MAC Styler');
    expect(products.find((product) => product.name === 'Hisense TV product')?.brand).toBe('Hisense TV');
  });

  it('writes one audit per product with before/after, reason, and one shared request id without a password', async () => {
    products.push(row('general-upper-2', 'GENERAL'));
    const result = await ProductsService.normalizeBrands(input, admin, context);

    expect(result).toMatchObject({ targetBrand: 'General', updatedCount: 2 });
    expect(writeAudit).toHaveBeenCalledTimes(2);
    for (const call of writeAudit.mock.calls) {
      expect(call[0]).toMatchObject({
        recordType: 'PRODUCT', action: 'UPDATE_DETAILS', reason: input.reason,
        beforeValues: { brand: 'GENERAL' }, afterValues: { brand: 'General' },
        requestId: context.requestId,
      });
      expect(call[1]).toBe(tx);
    }
    expect(new Set(writeAudit.mock.calls.map((call) => call[0].requestId))).toEqual(new Set([context.requestId]));
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('rejects a non-admin in the service before opening a transaction', async () => {
    await expect(ProductsService.normalizeBrands(input, employee, context)).rejects.toMatchObject({ statusCode: 403 });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('keeps a dry run read-only and outside a transaction', async () => {
    const result = await ProductsService.normalizeBrands({ ...input, dryRun: true }, admin, context);
    expect(result).toMatchObject({ affectedCount: 1, products: [{ id: 'general-upper', brand: 'GENERAL' }] });
    expect(runTransaction).not.toHaveBeenCalled();
    expect(repository.updateBrand).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it('is idempotent and writes no audit on a second identical run', async () => {
    await expect(ProductsService.normalizeBrands(input, admin, context)).resolves.toMatchObject({ updatedCount: 1 });
    await expect(ProductsService.normalizeBrands(input, admin, context)).resolves.toEqual({ targetBrand: 'General', updatedCount: 0, products: [] });
    expect(repository.updateBrand).toHaveBeenCalledTimes(1);
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it('aborts 501 affected products before any update or audit', async () => {
    repository.findForBrandNormalization.mockResolvedValue(Array.from(
      { length: MAX_BRAND_NORMALIZE_PRODUCTS + 1 }, (_, index) => row(`bulk-${index}`, 'GENERAL')
    ));
    await expect(ProductsService.normalizeBrands(input, admin, context)).rejects.toThrow('cannot update more than 500');
    expect(repository.updateBrand).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it('warns but succeeds when a dry-run target would create a new spelling', async () => {
    repository.findExactBrandUsage.mockResolvedValue(null);
    const result = await ProductsService.normalizeBrands({ ...input, targetBrand: 'General Electric', dryRun: true }, admin, context);
    expect(result).toMatchObject({ targetBrand: 'General Electric', affectedCount: 2 });
    expect('warnings' in result ? result.warnings : []).toHaveLength(1);
  });

  it('projects catalogue fields only in both response paths', async () => {
    repository.findForBrandNormalization.mockResolvedValue([{ ...row('safe', 'GENERAL'), price: '10.00', costPrice: '5.00', discount: '1.00', stockQuantity: 9 }]);
    const dryRun = await ProductsService.normalizeBrands({ ...input, dryRun: true }, admin, context);
    expect(Object.keys(dryRun.products[0]).sort()).toEqual(['brand', 'id', 'name', 'sku']);
    repository.updateBrand.mockResolvedValue(row('safe', 'General'));
    const write = await ProductsService.normalizeBrands(input, admin, context);
    expect(Object.keys(write.products[0]).sort()).toEqual(['brand', 'id', 'name', 'sku']);
  });
});
