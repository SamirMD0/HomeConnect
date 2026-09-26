import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PricingCardBrand } from '../../types/pricing-card.types';
import { BrandMark } from './BrandMark';

const LOGO = 'data:image/png;base64,AAAA';
const brand = (overrides: Partial<PricingCardBrand> = {}): PricingCardBrand => ({
  canonicalName: 'tcl', displayName: 'TCL', hasLogo: false, logoDataUrl: null, ...overrides,
});

const occurrences = (html: string, needle: string) => html.split(needle).length - 1;

describe('BrandMark', () => {
  // The operator-reported `TCL TCL`: a template set to logo+text, a brand whose
  // logo never resolved, and the name coming out twice. Whatever the header
  // config asks for, the name may only ever be painted once.
  it('renders the name exactly once in logo+text mode when no logo resolves', () => {
    const html = renderToStaticMarkup(<BrandMark brand={brand()} display="logo+text" logoUrl={null} />);

    expect(occurrences(html, 'TCL')).toBe(1);
    expect(html).not.toContain('<img');
  });

  it('renders the name exactly once in logo+text mode when the logo does resolve', () => {
    const html = renderToStaticMarkup(
      <BrandMark brand={brand({ hasLogo: true, logoDataUrl: LOGO })} display="logo+text" logoUrl={LOGO} />,
    );

    expect(occurrences(html, 'TCL')).toBe(1);
    expect(html).toContain(`src="${LOGO}"`);
  });

  it('renders the logo alone in logo mode, with no accompanying text', () => {
    const html = renderToStaticMarkup(
      <BrandMark brand={brand({ hasLogo: true, logoDataUrl: LOGO })} display="logo" logoUrl={LOGO} />,
    );

    expect(html).toContain(`src="${LOGO}"`);
    expect(occurrences(html, 'TCL')).toBe(0);
  });

  it('falls back to the name once in logo mode when the logo is missing', () => {
    const html = renderToStaticMarkup(<BrandMark brand={brand()} display="logo" logoUrl={null} />);

    expect(occurrences(html, 'TCL')).toBe(1);
    expect(html).not.toContain('<img');
  });

  it('never renders an image in text mode, even when a logo is available', () => {
    const html = renderToStaticMarkup(
      <BrandMark brand={brand({ hasLogo: true, logoDataUrl: LOGO })} display="text" logoUrl={LOGO} />,
    );

    expect(occurrences(html, 'TCL')).toBe(1);
    expect(html).not.toContain('<img');
  });

  it('renders nothing without a brand', () => {
    expect(renderToStaticMarkup(<BrandMark brand={null} display="logo+text" logoUrl={LOGO} />)).toBe('');
  });
});
