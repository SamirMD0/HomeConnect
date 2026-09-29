import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CanonicalSpecEditor, DimensionInputs } from './CanonicalSpecEditor';

vi.mock('../hooks/usePricingCardTemplates', () => ({
  usePricingCardSpecCatalog: () => ({
    data: [{ key: 'dimensions', label: 'Dimensions', group: 'Physical' }],
  }),
}));

describe('CanonicalSpecEditor dimensions', () => {
  it('lets the operator type a custom label directly', () => {
    const html = renderToStaticMarkup(
      <CanonicalSpecEditor
        value={[{ label: 'Height', value: '90 cm' }]}
        notes=""
        onChange={vi.fn()}
        onNotesChange={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Specification 1 key"');
    expect(html).toContain('placeholder="Choose or type a custom label"');
    expect(html).toContain('value="Height"');
  });

  it('renders three millimetre fields instead of one free-text value field', () => {
    const html = renderToStaticMarkup(
      <CanonicalSpecEditor
        value={[{ label: 'Dimensions', value: '1111x697x280mm' }]}
        notes=""
        onChange={vi.fn()}
        onNotesChange={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Width mm"');
    expect(html).toContain('aria-label="Height mm"');
    expect(html).toContain('aria-label="Depth mm"');
    expect(html).not.toContain('aria-label="Specification 1 value"');
  });

  it('shows parsed values in W, H, D order', () => {
    const html = renderToStaticMarkup(<DimensionInputs value="1111 × 697 × 280 mm" onChange={vi.fn()} />);
    expect(html.indexOf('value="1111"')).toBeLessThan(html.indexOf('value="697"'));
    expect(html.indexOf('value="697"')).toBeLessThan(html.indexOf('value="280"'));
  });
});
