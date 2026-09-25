import { describe, expect, it } from 'vitest';
import { normalizeSpecLabel, parseDimensions, resolveSpec } from './spec-catalog';

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

  it('resolves canonical aliases and attaches the catalog unit', () => {
    expect(resolveSpec(specs, 'capacity_kg')).toEqual({ label: 'Capacity (kg)', value: '9', unit: 'kg' });
    expect(resolveSpec(specs, 'resolution')).toEqual({ label: 'DISPLAY—RESOLUTION', value: '4K UHD' });
    expect(resolveSpec(specs, 'charging')).toBeNull();
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
