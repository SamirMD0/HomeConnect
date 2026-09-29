import { describe, expect, it } from 'vitest';
import type { ProductFeatureHighlight } from '../types/product.types';
import { groupIconsByCategory, highlightsChanged, reposition } from './ProductFeatureHighlightsEditor';

const icon = (overrides: Partial<Parameters<typeof groupIconsByCategory>[0][number]> = {}) => ({
  id: overrides.id ?? 'icon', code: overrides.code ?? 'wifi', label: overrides.label ?? 'Wi-Fi',
  category: overrides.category ?? null, svg: overrides.svg ?? '<svg />',
  isActive: overrides.isActive ?? true, sortOrder: overrides.sortOrder ?? 0,
});

describe('reposition', () => {
  it('rewrites positions to a contiguous 1-based sequence', () => {
    const entries: ProductFeatureHighlight[] = [
      { iconCode: 'qled', position: 7 }, { iconCode: 'wifi', position: 2 }, { iconCode: 'no-frost', position: 3 },
    ];
    expect(reposition(entries).map(({ iconCode, position }) => ({ iconCode, position }))).toEqual([
      { iconCode: 'qled', position: 1 }, { iconCode: 'wifi', position: 2 }, { iconCode: 'no-frost', position: 3 },
    ]);
  });
});

describe('groupIconsByCategory', () => {
  it('groups icons by category, buckets missing categories under "Other", and sorts inside groups by sortOrder', () => {
    const groups = groupIconsByCategory([
      icon({ id: 'a', code: 'qled', label: 'QLED', category: 'tv', sortOrder: 2 }),
      icon({ id: 'b', code: 'no-frost', label: 'No Frost', category: 'appliance', sortOrder: 1 }),
      icon({ id: 'c', code: 'wifi', label: 'Wi-Fi', category: 'tv', sortOrder: 1 }),
      icon({ id: 'd', code: 'orphan', label: 'Orphan', category: null }),
    ]);
    expect(groups.map(({ category }) => category)).toEqual(['appliance', 'Other', 'tv']);
    const tv = groups.find(({ category }) => category === 'tv')!;
    expect(tv.icons.map((entry) => entry.code)).toEqual(['wifi', 'qled']);
  });
});

describe('highlightsChanged', () => {
  const base: ProductFeatureHighlight[] = [{ iconCode: 'qled', label: 'QLED', value: null, position: 1 }];
  it('is false when the arrays are the same shape', () => {
    expect(highlightsChanged(base, [{ iconCode: 'qled', label: 'QLED', value: null, position: 1 }])).toBe(false);
    expect(highlightsChanged(undefined, [])).toBe(false);
  });
  it('is true when any field, order, or presence differs', () => {
    expect(highlightsChanged(base, [{ iconCode: 'qled', label: 'QLED Pro', value: null, position: 1 }])).toBe(true);
    expect(highlightsChanged(base, [{ iconCode: 'qled', label: 'QLED', value: '4K', position: 1 }])).toBe(true);
    expect(highlightsChanged(base, [])).toBe(true);
    expect(highlightsChanged(base, [{ iconCode: 'wifi', label: 'Wi-Fi', value: null, position: 1 }])).toBe(true);
  });
  it('treats missing label/value fields as null for comparison', () => {
    expect(highlightsChanged([{ iconCode: 'qled', position: 1 }], [{ iconCode: 'qled', label: null, value: null, position: 1 }])).toBe(false);
  });
});
