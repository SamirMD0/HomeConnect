import { describe, expect, it } from 'vitest';
import { canMergeProductImportRow, validProductImportDecision } from './ProductCsvImportDialog';
import type { ProductImportPreviewRow } from '../types/product.types';

const conflictRow: ProductImportPreviewRow = {
  rowNumber: 1,
  family: 'ELECTRONICS',
  externalCode: '43S5K',
  description: 'TCL TV',
  quantity: 3,
  costUsd: null,
  categoryId: null,
  issues: [],
  status: 'CONFLICT',
  conflicts: [{ kind: 'EXTERNAL_CODE', message: 'Already exists', productId: 'product-1' }],
  matches: [],
};

describe('product CSV conflict decisions', () => {
  it('never treats an unresolved conflict as complete', () => {
    expect(validProductImportDecision(conflictRow)).toBe(false);
    expect(validProductImportDecision(conflictRow, { rowNumber: 1, action: 'MERGE' })).toBe(false);
  });

  it('requires a changed code for a separate product and a target for a merge', () => {
    expect(validProductImportDecision(conflictRow, { rowNumber: 1, action: 'CREATE', externalCode: '43S5K' })).toBe(false);
    expect(validProductImportDecision(conflictRow, { rowNumber: 1, action: 'CREATE', externalCode: '43S5K-SECOND' })).toBe(true);
    expect(validProductImportDecision(conflictRow, { rowNumber: 1, action: 'MERGE', targetProductId: 'product-1' })).toBe(true);
  });

  it('allows an explicit manual exclusion but never performs one implicitly', () => {
    expect(validProductImportDecision(conflictRow, { rowNumber: 1, action: 'EXCLUDE' })).toBe(true);
  });

  it('requires a different CSV target when combining duplicate rows', () => {
    expect(validProductImportDecision(conflictRow, { rowNumber: 1, action: 'COMBINE' })).toBe(false);
    expect(validProductImportDecision(conflictRow, { rowNumber: 1, action: 'COMBINE', targetRowNumber: 1 })).toBe(false);
    expect(validProductImportDecision(conflictRow, { rowNumber: 1, action: 'COMBINE', targetRowNumber: 2 })).toBe(true);
  });

  it('accepts a changed name for a name-only duplicate conflict', () => {
    const nameConflict = { ...conflictRow, conflicts: [{ kind: 'NAME_MODEL' as const, message: 'Same name and model' }] };
    expect(validProductImportDecision(nameConflict, { rowNumber: 1, action: 'CREATE', name: 'TCL TV - showroom' })).toBe(true);
  });

  it('offers merge only when the backend found an existing product', () => {
    expect(canMergeProductImportRow(conflictRow)).toBe(false);
    expect(canMergeProductImportRow({ ...conflictRow, matches: [{
      id: 'product-1', sku: 'HC-1', name: 'Existing TV', model: '43S5K', brand: 'TCL',
      isActive: true, trackStock: true, stockQuantity: 2, hasOpeningBalance: true,
    }] })).toBe(true);
  });
});
