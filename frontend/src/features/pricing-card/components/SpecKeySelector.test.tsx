import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { moveSpecKey, SpecKeySelector, toggleSpecKey } from './SpecKeySelector';

const catalog = [
  { key: 'screen_size', label: 'Screen size', group: 'Display', unit: 'inch' },
  { key: 'resolution', label: 'Resolution', group: 'Display' },
  { key: 'capacity_kg', label: 'Capacity (kg)', group: 'Capacity', unit: 'kg' },
];

describe('SpecKeySelector', () => {
  it('renders grouped catalog choices and the controlled selected order', () => {
    const html = renderToStaticMarkup(
      <SpecKeySelector catalog={catalog} value={['capacity_kg', 'screen_size']} onChange={vi.fn()} />,
    );

    expect(html).toContain('Available specification keys');
    expect(html).toContain('Display');
    expect(html).toContain('Capacity');
    expect(html).toContain('Screen size');
    expect(html).toContain('capacity_kg');
    expect(html.indexOf('1.</span>')).toBeLessThan(html.indexOf('2.</span>'));
    expect(html).toContain('Move Capacity (kg) up');
    expect(html).toContain('Remove Screen size');
    expect(html).not.toContain('type="text"');
  });

  it('keeps an unknown saved key visible so it can be removed', () => {
    const html = renderToStaticMarkup(
      <SpecKeySelector catalog={catalog} value={['legacy_key']} onChange={vi.fn()} />,
    );

    expect(html).toContain('legacy_key');
    expect(html).toContain('Not in catalog');
    expect(html).toContain('Remove legacy_key');
  });

  it('adds once, removes, and reorders without mutating the supplied value', () => {
    const original = ['screen_size', 'resolution'];
    expect(toggleSpecKey(original, 'capacity_kg', true)).toEqual(['screen_size', 'resolution', 'capacity_kg']);
    expect(toggleSpecKey(original, 'screen_size', true)).toEqual(original);
    expect(toggleSpecKey(original, 'screen_size', false)).toEqual(['resolution']);
    expect(moveSpecKey(original, 1, 0)).toEqual(['resolution', 'screen_size']);
    expect(moveSpecKey(original, 0, -1)).toEqual(original);
    expect(original).toEqual(['screen_size', 'resolution']);
  });
});
