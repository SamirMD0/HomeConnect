import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({ db: {
  productImport: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  productExternalIdentifier: { findMany: vi.fn() },
  product: { findMany: vi.fn() },
  category: { findMany: vi.fn() },
  stockMovement: { findMany: vi.fn() },
} }));
vi.mock('../../../lib/prisma', () => ({ prisma: db }));

import { ProductImportService } from './product-import.service';

const importId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const user = { userId: '33333333-3333-4333-8333-333333333333', role: 'ADMIN' };
const row = { rowNumber: 1, family: 'ELECTRONICS', externalCode: '43S5K', description: 'TCL TV', quantity: 3, costUsd: null, issues: [] };
const draft = (mappings: Record<string, string | null> = {}) => ({
  id: importId, fileName: 'TCLINV.csv', fileHash: 'hash', sourceSystem: 'legacy-inventory', brand: 'TCL', status: 'DRAFT',
  rows: [row], categoryMappings: mappings, decisions: null, result: null, createdById: user.userId, committedById: null,
  createdAt: new Date('2026-09-26T10:00:00Z'), updatedAt: new Date('2026-09-26T10:00:00Z'), committedAt: null,
});

describe('product CSV import preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.productImport.findFirst.mockResolvedValue(null);
    db.productExternalIdentifier.findMany.mockResolvedValue([]);
    db.product.findMany.mockResolvedValue([]);
    db.category.findMany.mockResolvedValue([]);
    db.stockMovement.findMany.mockResolvedValue([]);
  });

  it('requires an explicit family mapping before a row becomes ready', async () => {
    db.productImport.findUnique.mockResolvedValue(draft());
    expect((await ProductImportService.getDraft(importId, user)).rows[0]).toMatchObject({
      status: 'CONFLICT',
      conflicts: [expect.objectContaining({ kind: 'CATEGORY' })],
    });

    db.productImport.update.mockResolvedValue(draft({ ELECTRONICS: null }));
    expect((await ProductImportService.updateDraft(importId, { categoryMappings: { ELECTRONICS: null } }, user)).rows[0].status).toBe('READY');
  });

  it('surfaces an already imported external code instead of skipping it', async () => {
    const product = { id: productId, sku: 'HC-000001', name: 'Existing TV', model: '43S5K', brand: 'TCL', isActive: true, trackStock: true, stockQuantity: 2 };
    db.productImport.findUnique.mockResolvedValue(draft({ ELECTRONICS: null }));
    db.productExternalIdentifier.findMany.mockResolvedValue([{ productId, normalizedCode: '43S5K', product }]);
    db.product.findMany.mockResolvedValue([product]);
    db.stockMovement.findMany.mockResolvedValue([{ productId }]);

    const preview = await ProductImportService.getDraft(importId, user);
    expect(preview.counts).toMatchObject({ total: 1, ready: 0, conflicts: 1 });
    expect(preview.rows[0]).toMatchObject({
      status: 'CONFLICT',
      matches: [expect.objectContaining({ id: productId, hasOpeningBalance: true })],
    });
    expect(preview.rows[0].conflicts.map((conflict) => conflict.kind)).toContain('EXTERNAL_CODE');
  });
});
