import { describe, expect, it } from 'vitest';
import { parseDimensionsFromSpecs, resolveSpecsForTemplate } from './spec-catalog';

describe('client spec catalog', () => {
  it('resolves specs in the template-declared order and drops unknown keys', () => {
    const specs = [
      { label: 'resolution', value: '4K' },
      { label: 'Screen', value: '50 inch' },
      { label: 'Weight', value: '12' },
    ];
    const rows = resolveSpecsForTemplate(specs, ['screen_size', 'resolution', 'weight', 'not_a_key']);
    expect(rows).toEqual([
      { canonicalKey: 'screen_size', label: 'Screen size', value: '50 inch', unit: 'inch' },
      { canonicalKey: 'resolution', label: 'Resolution', value: '4K' },
      { canonicalKey: 'weight', label: 'Weight', value: '12', unit: 'kg' },
    ]);
  });

  it('resolves a Dimensions row typed with the plural label and mm', () => {
    const dims = parseDimensionsFromSpecs([{ label: 'Dimensions', value: '1111 × 697 × 280 mm' }]);
    expect(dims).toEqual({ widthMm: 1111, heightMm: 697, depthMm: 280 });
  });

  it('accepts an aliased dimensions label the user typed without units', () => {
    const dims = parseDimensionsFromSpecs([{ label: 'size (wxhxd)', value: '100x50x30' }]);
    expect(dims).toEqual({ widthMm: 100, heightMm: 50, depthMm: 30 });
  });

  it('returns empty when the value cannot be parsed as three dimensions', () => {
    expect(parseDimensionsFromSpecs([{ label: 'Dimensions', value: '100x50' }])).toEqual({});
  });

  it('does not match "dimension" — this is exactly the drift the modal fix guards against', () => {
    // Singular label does not appear in the canonical aliases; the row must
    // be discarded so the operator picks the dropdown value.
    expect(parseDimensionsFromSpecs([{ label: 'Dimension', value: '1x1x1 mm' }])).toEqual({});
  });
});
