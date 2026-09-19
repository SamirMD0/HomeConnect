import { describe, expect, it } from 'vitest';
import { normalizeBrandKey, normalizeBrandSpelling } from './brand-key';

describe('brand key normalization', () => {
  it('collapses whitespace and case-folds the catalog key', () => {
    expect(normalizeBrandKey('  Samsung   Electronics ')).toBe('samsung electronics');
    expect(normalizeBrandSpelling('  Samsung   Electronics ')).toBe('Samsung Electronics');
  });

  it('returns null for missing or blank brands', () => {
    expect(normalizeBrandKey(null)).toBeNull();
    expect(normalizeBrandKey('   ')).toBeNull();
  });
});
