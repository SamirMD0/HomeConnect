import { describe, expect, it } from 'vitest';
import { CANONICAL_SPEC_KEYS, customSpecKey, normalizeSpecLabel, parseDimensions, resolveSpec, resolveSpecKey } from './spec-catalog';

describe('pricing-card spec catalog', () => {
  const specs = [
    { label: 'Capacity (kg)', value: '9' },
    { label: 'DISPLAY—RESOLUTION', value: '4K UHD' },
    { label: 'Package size', value: '61 x 86 x 56 cm' },
    { label: 'Dimensions', value: '60 x 85 x 55 cm' },
  ];

  it('normalizes case, punctuation, and whitespace', () => {
    expect(normalizeSpecLabel('  Capacity (KG)  ')).toBe('capacity kg');
    expect(normalizeSpecLabel('DISPLAY—RESOLUTION')).toBe('display resolution');
  });

  it('provides a display label and group for every canonical key', () => {
    expect(Object.entries(CANONICAL_SPEC_KEYS)).toEqual(expect.arrayContaining([
      ['screen_size', expect.objectContaining({ label: 'Screen size', group: 'Display' })],
      ['capacity_kg', expect.objectContaining({ label: 'Capacity (kg)', group: 'Capacity' })],
    ]));
    for (const definition of Object.values(CANONICAL_SPEC_KEYS)) {
      expect(definition.label).not.toBe('');
      expect(definition.group).not.toBe('');
    }
  });

  it('resolves canonical aliases and attaches the catalog unit', () => {
    expect(resolveSpec(specs, 'capacity_kg')).toEqual({ label: 'Capacity (kg)', value: '9', unit: 'kg' });
    expect(resolveSpec(specs, 'resolution')).toEqual({ label: 'DISPLAY—RESOLUTION', value: '4K UHD' });
    expect(resolveSpec(specs, 'charging')).toBeNull();
  });

  it('creates a stable key for a custom label and resolves it again', () => {
    const key = customSpecKey('Height');
    expect(key).toMatch(/^custom_[a-z0-9_]+$/);
    expect(customSpecKey(' height ')).toBe(key);
    expect(resolveSpecKey([{ label: 'Height', value: '90 cm' }], key)).toEqual({
      canonicalKey: key, label: 'Height', value: '90 cm',
    });
  });

  it('gives an explicit template alias precedence over base aliases', () => {
    expect(resolveSpec(specs, 'dimensions', ['package size'])).toEqual({
      label: 'Package size', value: '61 x 86 x 56 cm',
    });
  });

  it('parses width, height, and depth into millimetres', () => {
    expect(parseDimensions(specs)).toEqual({ widthMm: 600, heightMm: 850, depthMm: 550 });
    expect(parseDimensions([{ label: 'Size (WxHxD)', value: '600 × 850 × 550 mm' }])).toEqual({
      widthMm: 600, heightMm: 850, depthMm: 550,
    });
  });
});
