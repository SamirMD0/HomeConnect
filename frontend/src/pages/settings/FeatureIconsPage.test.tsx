import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PricingCardFeatureIcon } from '../../features/pricing-card/types/pricing-card.types';
import { errorMessage, FeatureIconsPage, uniqueCategories } from './FeatureIconsPage';

const state = vi.hoisted(() => ({
  role: 'ADMIN' as 'ADMIN' | 'EMPLOYEE',
  icons: [] as PricingCardFeatureIcon[],
}));

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1', role: state.role } }) }));
vi.mock('../../features/pricing-card/hooks/useFeatureIcons', () => ({
  useFeatureIcons: () => ({ data: state.icons, isLoading: false, isError: false }),
  useCreateFeatureIcon: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateFeatureIcon: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveFeatureIcon: () => ({ mutate: vi.fn(), isPending: false }),
}));

const iconRow = (overrides: Partial<PricingCardFeatureIcon> = {}): PricingCardFeatureIcon => ({
  id: overrides.id ?? 'icon-1', code: overrides.code ?? 'qled', label: overrides.label ?? 'QLED',
  category: overrides.category ?? 'tv', svg: overrides.svg ?? '<svg viewBox="0 0 24 24"></svg>',
  isActive: overrides.isActive ?? true, sortOrder: overrides.sortOrder ?? 0,
});

describe('FeatureIconsPage', () => {
  beforeEach(() => {
    state.role = 'ADMIN';
    state.icons = [
      iconRow({ id: 'icon-1', code: 'qled', label: 'QLED', category: 'tv' }),
      iconRow({ id: 'icon-2', code: 'no-frost', label: 'No Frost', category: 'appliance' }),
      iconRow({ id: 'icon-3', code: 'archived', label: 'Old', category: null, isActive: false }),
    ];
  });

  it('locks the page behind an admin-only gate for non-admin viewers', () => {
    state.role = 'EMPLOYEE';
    expect(renderPage()).toContain('admin-only');
  });

  it('lists every icon with its code, label, and category badge', () => {
    const html = renderPage();
    expect(html).toContain('QLED');
    expect(html).toContain('no-frost');
    expect(html).toContain('>tv<');
    expect(html).toContain('>appliance<');
    expect(html).toContain('Archived');
  });

  it('shows the SVG preview when the editor draft has SVG content', () => {
    const html = renderPage();
    expect(html.match(/feature-icon-preview/g) ?? []).not.toBeNull();
  });

  it('exposes an Add icon button', () => {
    expect(renderPage()).toContain('Add icon');
  });

  it('derives unique sorted categories from the icon list', () => {
    expect(uniqueCategories([
      { category: 'tv' }, { category: 'appliance' }, { category: null }, { category: 'tv' },
    ])).toEqual(['appliance', 'tv']);
  });

  it('extracts the server error message from axios-style errors and falls back to null', () => {
    expect(errorMessage({ response: { data: { error: { message: 'SVG scripts are not allowed' } } } })).toBe('SVG scripts are not allowed');
    expect(errorMessage({ response: { data: { message: 'Bad Request' } } })).toBe('Bad Request');
    expect(errorMessage('nope')).toBeNull();
  });
});

function renderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/settings/pricing-cards/feature-icons']}>
      <Routes><Route path="/settings/pricing-cards/feature-icons" element={<FeatureIconsPage />} /></Routes>
    </MemoryRouter>,
  );
}
