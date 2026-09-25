import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandLogo } from '../../features/pricing-card/types/pricing-card.types';
import { BrandLogosPage, topMissingBrands } from './BrandLogosPage';

const state = vi.hoisted(() => ({
  role: 'ADMIN' as 'ADMIN' | 'EMPLOYEE',
  logos: [] as BrandLogo[],
  brands: [] as Array<{ canonical: string; productCount: number; spellings: string[] }>,
}));

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1', role: state.role } }) }));
vi.mock('../../features/pricing-card/hooks/useBrandLogos', () => ({
  useBrandLogos: () => ({ data: state.logos, isLoading: false, isError: false }),
  useCreateBrandLogo: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateBrandLogo: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveBrandLogo: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../features/products/hooks/useProducts', () => ({
  useProductBrands: () => ({ data: state.brands, isLoading: false }),
}));

const logoRow = (overrides: Partial<BrandLogo> = {}): BrandLogo => ({
  id: overrides.id ?? 'logo-1', canonicalName: overrides.canonicalName ?? 'lg',
  displayName: overrides.displayName ?? 'LG', hasLogo: overrides.hasLogo ?? true,
  logoMimeType: overrides.logoMimeType ?? 'image/webp', logoByteSize: overrides.logoByteSize ?? 500,
  logoDataUrl: overrides.logoDataUrl ?? 'data:image/webp;base64,LG',
  isActive: overrides.isActive ?? true,
});

describe('BrandLogosPage', () => {
  beforeEach(() => {
    state.role = 'ADMIN';
    state.logos = [
      logoRow({ id: 'logo-1', canonicalName: 'lg', displayName: 'LG' }),
      logoRow({ id: 'logo-2', canonicalName: 'samsung', displayName: 'Samsung' }),
    ];
    state.brands = [
      { canonical: 'lg', productCount: 20, spellings: ['LG'] },
      { canonical: 'samsung', productCount: 15, spellings: ['Samsung'] },
      { canonical: 'tcl', productCount: 12, spellings: ['TCL'] },
      { canonical: 'hisense', productCount: 8, spellings: ['Hisense'] },
    ];
  });

  it('gates the page behind an admin-only screen for non-admins', () => {
    state.role = 'EMPLOYEE';
    expect(renderPage()).toContain('admin-only');
  });

  it('lists every brand logo with its canonical name and image preview', () => {
    const html = renderPage();
    expect(html).toContain('data:image/webp;base64,LG');
    expect(html).toContain('>samsung<');
    expect(html).toContain('LG');
  });

  it('surfaces the Add from products panel with the highest-count uncovered brands first', () => {
    const html = renderPage();
    expect(html).toContain('Brands with products but no logo');
    expect(html).toContain('TCL');
    expect(html).toContain('Hisense');
    expect(html).toContain('×12');
    expect(html).toContain('×8');
  });

  it('hides the uncovered panel entirely when every brand already has a logo', () => {
    state.brands = [{ canonical: 'lg', productCount: 20, spellings: ['LG'] }];
    expect(renderPage()).not.toContain('Brands with products but no logo');
  });

  describe('topMissingBrands', () => {
    it('returns only brands that are not yet in the logo catalog', () => {
      const result = topMissingBrands([
        { canonical: 'lg', productCount: 20, spellings: ['LG'] },
        { canonical: 'tcl', productCount: 12, spellings: ['TCL'] },
      ], [{ canonicalName: 'lg' }]);
      expect(result).toEqual([{ canonical: 'tcl', displayName: 'TCL', productCount: 12 }]);
    });

    it('sorts by product count desc and caps at the requested limit', () => {
      const result = topMissingBrands([
        { canonical: 'a', productCount: 2, spellings: ['A'] },
        { canonical: 'b', productCount: 10, spellings: ['B'] },
        { canonical: 'c', productCount: 5, spellings: ['C'] },
      ], [], 2);
      expect(result.map((brand) => brand.canonical)).toEqual(['b', 'c']);
    });

    it('falls back to the canonical name when no spelling is available', () => {
      expect(topMissingBrands([{ canonical: 'foo', productCount: 1 }], [])).toEqual([{ canonical: 'foo', displayName: 'foo', productCount: 1 }]);
    });
  });
});

function renderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/pricing-cards/brand-logos']}>
      <Routes><Route path="/pricing-cards/brand-logos" element={<BrandLogosPage />} /></Routes>
    </MemoryRouter>,
  );
}
