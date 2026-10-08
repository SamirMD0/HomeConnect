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
import { ALL_PRODUCT_IMPORT_BRANDS } from './product-catalog-defaults';

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

  it('keeps per-row brands in an all-brands preview and matches each row against its own brand', async () => {
    const importedRows = [row, { ...row, rowNumber: 2, externalCode: 'D1', description: 'DSP HAIR DRYER' }, { ...row, rowNumber: 3, externalCode: 'G1', description: 'MILK POT' }];
    db.productImport.findUnique.mockResolvedValue({ ...draft({ ELECTRONICS: null }), brand: ALL_PRODUCT_IMPORT_BRANDS, rows: importedRows });
    db.product.findMany.mockResolvedValue([{ id: productId, sku: 'HC-1', name: 'Old TV', model: '43S5K', brand: 'TCL', isActive: true, trackStock: true, stockQuantity: 2 }]);
    const preview = await ProductImportService.getDraft(importId, user);
    expect(preview.rows.map((row) => row.brand)).toEqual(['TCL', 'DSP', null]);
    expect(preview.rows[0].conflicts).toContainEqual(expect.objectContaining({ kind: 'MODEL' }));
    expect(preview.rows[1].matches).toEqual([]);
  });

  it('stores detected brands for all rows when creating an all-brands draft', async () => {
    db.productImport.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...draft(), ...data }));
    const preview = await ProductImportService.createDraft({ fileName: 'all.csv', sourceSystem: 'legacy', brand: ALL_PRODUCT_IMPORT_BRANDS, csvText: 'Family:,ELECTRONICS,Code,Description,Qty,,,T1,TCL TV,1,0,0\nFamily:,BEAUTY,Code,Description,Qty,,,D1,DSP DRYER,2,0,0' }, user);
    expect(preview.rows.map((row) => row.brand)).toEqual(['TCL', 'DSP']);
    expect(preview.rows.map((row) => row.productType)).toEqual(['TVs', null]);
    expect(preview.categoryGroups.map((group) => group.key)).toEqual(['type:TVs', 'unclassified']);
    expect(preview.counts.total).toBe(2);
  });

  it('maps refrigerators and washing machines separately within the same CSV family', async () => {
    const refrigeratorId = '44444444-4444-4444-8444-444444444444';
    const washingMachineId = '55555555-5555-4555-8555-555555555555';
    const productRows = [
      { ...row, description: 'TCL REFRIGERATOR', productType: 'Refrigerators' },
      { ...row, rowNumber: 2, externalCode: 'W1', description: 'LG WASHING MACHINE', productType: 'Washing Machines' },
    ];
    db.productImport.findUnique.mockResolvedValue({ ...draft(), rows: productRows, categoryMappings: {
      'type:Refrigerators': refrigeratorId, 'type:Washing Machines': washingMachineId,
    } });
    db.category.findMany.mockResolvedValue([
      { id: refrigeratorId, name: 'Refrigerators', parentId: 'family', isActive: true, _count: { children: 0 }, parent: { name: 'Home Appliances', isActive: true } },
      { id: washingMachineId, name: 'Washing Machines', parentId: 'family', isActive: true, _count: { children: 0 }, parent: { name: 'Home Appliances', isActive: true } },
    ]);
    const preview = await ProductImportService.getDraft(importId, user);
    expect(preview.categoryGroups.map((group) => group.label)).toEqual(['Refrigerators', 'Washing Machines']);
    expect(preview.rows.map((row) => row.categoryId)).toEqual([refrigeratorId, washingMachineId]);
    expect(preview.counts.ready).toBe(2);
  });

  it('assigns the selected brand to every row without filtering the file', async () => {
    db.productImport.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...draft(), ...data }));
    const preview = await ProductImportService.createDraft({ fileName: 'all.csv', sourceSystem: 'legacy', brand: 'DSP', csvText: 'Family:,ELECTRONICS,Code,Description,Qty,,,T1,TCL TV,1,0,0\nFamily:,BEAUTY,Code,Description,Qty,,,D1,DSP DRYER,2,0,0' }, user);
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]).toMatchObject({ rowNumber: 1, brand: 'DSP', externalCode: 'T1' });
    expect(preview.rows[1]).toMatchObject({ rowNumber: 2, brand: 'DSP', externalCode: 'D1' });
  });

  it('rejects a hair dryer mapped to an air conditioner category in another family', async () => {
    db.productImport.findUnique.mockResolvedValue({ ...draft({ 'type:Hair Dryers': 'ac' }), rows: [{ ...row, description: 'DSP HAIR DRYER' }] });
    db.category.findMany.mockResolvedValue([{ id: 'ac', name: 'Air Conditioners', parentId: 'home', isActive: true, _count: { children: 0 }, parent: { name: 'Home Appliances', isActive: true } }]);
    const preview = await ProductImportService.getDraft(importId, user);
    expect(preview.rows[0].status).toBe('INVALID');
    expect(preview.rows[0].issues).toContain('This category must belong to Beauty');
  });

  it('classifies unidentified products individually without applying one category to the rest', async () => {
    db.productImport.findUnique.mockResolvedValue({ ...draft({ 'row:1': 'dryer', 'row:2': null }), rows: [
      { ...row, description: 'UNKNOWN A', productType: null },
      { ...row, rowNumber: 2, externalCode: 'UNKNOWN-2', description: 'UNKNOWN B', productType: null },
    ] });
    db.category.findMany.mockResolvedValue([{ id: 'dryer', name: 'Hair Dryers', parentId: 'beauty', isActive: true, _count: { children: 0 }, parent: { name: 'Beauty', isActive: true } }]);
    const preview = await ProductImportService.getDraft(importId, user);
    expect(preview.rows.map((row) => row.categoryId)).toEqual(['dryer', null]);
    expect(preview.rows.map((row) => row.productType)).toEqual([null, null]);
    expect(preview.counts.ready).toBe(2);
  });

  it('requires an explicit product-type mapping before a row becomes ready', async () => {
    db.productImport.findUnique.mockResolvedValue(draft());
    expect((await ProductImportService.getDraft(importId, user)).rows[0]).toMatchObject({
      status: 'CONFLICT',
      conflicts: [expect.objectContaining({ kind: 'CATEGORY' })],
    });

    db.productImport.update.mockResolvedValue(draft({ 'type:TVs': null }));
    expect((await ProductImportService.updateDraft(importId, { categoryMappings: { 'type:TVs': null } }, user)).rows[0].status).toBe('READY');
  });

  it('upgrades an older family-only draft without applying its category to every product type', async () => {
    db.productImport.findUnique.mockResolvedValue(draft({ ELECTRONICS: null }));
    const preview = await ProductImportService.getDraft(importId, user);
    expect(preview.categoryGroups.map((group) => group.key)).toEqual(['type:TVs']);
    expect(preview.rows[0]).toMatchObject({ productType: 'TVs', categoryId: undefined, status: 'CONFLICT' });
    expect(preview.rows[0].conflicts).toContainEqual({ kind: 'CATEGORY', message: 'Choose a category mapping for TVs' });
  });

  it('surfaces an already imported external code instead of skipping it', async () => {
    const product = { id: productId, sku: 'HC-000001', name: 'Existing TV', model: '43S5K', brand: 'TCL', isActive: true, trackStock: true, stockQuantity: 2 };
    db.productImport.findUnique.mockResolvedValue(draft({ 'type:TVs': null }));
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
