import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tx } = vi.hoisted(() => ({ tx: {
  productImport: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  productExternalIdentifier: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  product: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  stockMovement: { findMany: vi.fn(), create: vi.fn() },
  user: { findUniqueOrThrow: vi.fn() },
} }));
vi.mock('../../../lib/prisma', () => ({ prisma: tx }));
vi.mock('../../financial/infrastructure/transaction', () => ({ runFinancialTransaction: (work: (client: unknown) => unknown) => work(tx) }));
vi.mock('../audit/service-audit', () => ({ writeServiceAudit: vi.fn() }));
vi.mock('./product-sku', () => ({ generateProductSku: () => 'HC-1' }));
vi.mock('./product-internal-barcode', () => ({ generateInternalBarcode: () => '1234' }));

import { ProductImportService } from './product-import.service';
import { ALL_PRODUCT_IMPORT_BRANDS } from './product-catalog-defaults';

const user = { userId: 'admin', role: 'ADMIN' };
const rows = ['TCL TV', 'DSP DRYER', 'MILK POT'].map((description, index) => ({
  rowNumber: index + 1, family: 'ELECTRONICS', externalCode: `CODE-${index}`, description,
  quantity: 1, costUsd: null, issues: [],
}));

beforeEach(() => {
  vi.resetAllMocks();
  tx.productImport.findFirst.mockResolvedValue(null);
  tx.productExternalIdentifier.findMany.mockResolvedValue([]);
  tx.productExternalIdentifier.findUnique.mockResolvedValue(null);
  tx.product.findMany.mockResolvedValue([]);
  tx.product.findFirst.mockResolvedValue(null);
  tx.user.findUniqueOrThrow.mockResolvedValue({ fullName: 'Admin', username: 'admin' });
  tx.product.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: 'product' }));
});

describe('brand values written by CSV import', () => {
  it.each([
    { selection: ALL_PRODUCT_IMPORT_BRANDS, expected: ['TCL', 'DSP', null] },
    { selection: 'TCL', expected: ['TCL', 'TCL', 'TCL'] },
  ])('creates products using row brands for selection $selection', async ({ selection, expected }) => {
    tx.productImport.findUnique.mockResolvedValue({
      id: 'draft', fileName: 'all.csv', fileHash: 'hash', sourceSystem: 'legacy', brand: selection,
      status: 'DRAFT', rows, categoryMappings: { 'type:TVs': null, 'type:Cookware': null, unclassified: null }, createdAt: new Date(),
    });
    const result = await ProductImportService.commit('draft', { decisions: [] }, user, { requestId: null, ipAddress: null });
    expect(result).toMatchObject({ summary: { created: 3 } });
    expect(tx.product.create.mock.calls.map(([input]) => input.data.brand)).toEqual(expected);
    expect(tx.productImport.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMMITTED' }) }));
  });
});
