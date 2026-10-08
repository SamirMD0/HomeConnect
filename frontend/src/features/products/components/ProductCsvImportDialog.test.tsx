import { describe, expect, it } from 'vitest';
import {
  canMergeProductImportRow,
  validProductImportDecision,
  importCategoryGroups,
  importFamilySections,
  suggestedCategoryMappings,
} from './ProductCsvImportDialog';
import type { Category } from '../../categories/categories';
import type { ProductImportPreview, ProductImportPreviewRow } from '../types/product.types';

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
  it('uses logical families even when the CSV puts a product in the wrong family', () => {
    const preview = {
      rows: [{ ...conflictRow, family: 'BEAUTY', description: 'DSP BLENDER' }],
    } as ProductImportPreview;
    expect(importFamilySections(preview)[0].family).toBe('Small Appliances');
  });

  it('automatically assigns the detected category only within its correct family', () => {
    const preview = {
      rows: [{ ...conflictRow, family: 'HOME APPLIANCES', description: 'DSP HAIR DRYER' }],
    } as ProductImportPreview;
    const categories = [
      { id: 'beauty', name: 'Beauty', parentId: null, assignable: false },
      { id: 'home', name: 'Home Appliances', parentId: null, assignable: false },
      { id: 'ac', name: 'Air Conditioners', parentId: 'home', assignable: true },
      { id: 'wrong-dryer', name: 'Hair Dryers', parentId: 'home', assignable: true },
      { id: 'dryer', name: 'Hair Dryers', parentId: 'beauty', assignable: true },
    ] as Category[];
    expect(suggestedCategoryMappings(preview, categories)).toEqual({ 'type:Hair Dryers': 'dryer' });
  });
  it('splits every family into its product types even when an older preview has only families', () => {
    const preview = {
      families: ['HOME APPLIANCES', 'BEAUTY'],
      rows: [
        { ...conflictRow, family: 'HOME APPLIANCES', description: 'TCL REFRIGERATOR' },
        { ...conflictRow, family: 'HOME APPLIANCES', description: 'LG WASHING MACHINE' },
        { ...conflictRow, family: 'HOME APPLIANCES', description: 'AGI FREEZER' },
        { ...conflictRow, family: 'BEAUTY', description: 'DSP HAIR DRYER' },
        { ...conflictRow, family: 'BEAUTY', description: 'VGR TRIMMER' },
      ],
    } as ProductImportPreview;
    const sections = importFamilySections(preview);
    expect(
      sections.map(({ family, groups }) => [family, groups.map((group) => group.label)])
    ).toEqual([
      ['Home Appliances', ['Refrigerators', 'Washing Machines', 'Freezers']],
      ['Beauty', ['Hair Dryers', 'Trimmers & Shavers']],
    ]);
    expect(importCategoryGroups(preview)).toHaveLength(5);
  });
  it('shows product types in category mapping instead of source families', () => {
    const groups = [
      { key: 'type:Refrigerators', label: 'Refrigerators', suggestedCategory: 'Refrigerators' },
    ];
    expect(
      importCategoryGroups({
        families: ['HOME APPLIANCES'],
        categoryGroups: groups,
      } as ProductImportPreview)
    ).toEqual(groups);
  });
  it('never treats an unresolved conflict as complete', () => {
    expect(validProductImportDecision(conflictRow)).toBe(false);
    expect(validProductImportDecision(conflictRow, { rowNumber: 1, action: 'MERGE' })).toBe(false);
  });

  it('requires a changed code for a separate product and a target for a merge', () => {
    expect(
      validProductImportDecision(conflictRow, {
        rowNumber: 1,
        action: 'CREATE',
        externalCode: '43S5K',
      })
    ).toBe(false);
    expect(
      validProductImportDecision(conflictRow, {
        rowNumber: 1,
        action: 'CREATE',
        externalCode: '43S5K-SECOND',
      })
    ).toBe(true);
    expect(
      validProductImportDecision(conflictRow, {
        rowNumber: 1,
        action: 'MERGE',
        targetProductId: 'product-1',
      })
    ).toBe(true);
  });

  it('allows an explicit manual exclusion but never performs one implicitly', () => {
    expect(validProductImportDecision(conflictRow, { rowNumber: 1, action: 'EXCLUDE' })).toBe(true);
  });

  it('requires a different CSV target when combining duplicate rows', () => {
    expect(validProductImportDecision(conflictRow, { rowNumber: 1, action: 'COMBINE' })).toBe(
      false
    );
    expect(
      validProductImportDecision(conflictRow, {
        rowNumber: 1,
        action: 'COMBINE',
        targetRowNumber: 1,
      })
    ).toBe(false);
    expect(
      validProductImportDecision(conflictRow, {
        rowNumber: 1,
        action: 'COMBINE',
        targetRowNumber: 2,
      })
    ).toBe(true);
  });

  it('accepts a changed name for a name-only duplicate conflict', () => {
    const nameConflict = {
      ...conflictRow,
      conflicts: [{ kind: 'NAME_MODEL' as const, message: 'Same name and model' }],
    };
    expect(
      validProductImportDecision(nameConflict, {
        rowNumber: 1,
        action: 'CREATE',
        name: 'TCL TV - showroom',
      })
    ).toBe(true);
  });

  it('offers merge only when the backend found an existing product', () => {
    expect(canMergeProductImportRow(conflictRow)).toBe(false);
    expect(
      canMergeProductImportRow({
        ...conflictRow,
        matches: [
          {
            id: 'product-1',
            sku: 'HC-1',
            name: 'Existing TV',
            model: '43S5K',
            brand: 'TCL',
            isActive: true,
            trackStock: true,
            stockQuantity: 2,
            hasOpeningBalance: true,
          },
        ],
      })
    ).toBe(true);
  });
});
