import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar } from './Sidebar';
import { findActiveItem, isItemVisible, isPathActive, NAVIGATION, type NavigationRole } from './navigation';

const authState = vi.hoisted(() => ({ role: 'ADMIN' as NavigationRole, fullName: 'Sam Owner' }));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', role: authState.role, fullName: authState.fullName } }),
}));

function render(props: { path: string; collapsed: boolean }) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[props.path]}>
      <Sidebar collapsed={props.collapsed} onToggle={() => {}} onLogout={() => {}} />
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  it('renders every section heading in expanded mode', () => {
    authState.role = 'ADMIN';
    const html = render({ path: '/', collapsed: false });
    for (const section of NAVIGATION) {
      expect(html).toContain(section.heading.en);
    }
  });

  it('omits section headings and labels in the collapsed rail', () => {
    authState.role = 'ADMIN';
    const html = render({ path: '/', collapsed: true });
    // Headings hidden
    expect(html).not.toContain('>Sales<');
    expect(html).not.toContain('>Finance<');
    // Icons remain accessible via aria-label / title
    expect(html).toContain('aria-label="Customers / الزبائن"');
    expect(html).toContain('title="Customers / الزبائن"');
  });

  it('hides ADMIN-only items from EMPLOYEE accounts', () => {
    authState.role = 'EMPLOYEE';
    const html = render({ path: '/', collapsed: false });
    expect(html).not.toContain('Pricing Cards');
    expect(html).not.toContain('/pricing-cards');
    expect(html).not.toContain('/settings');
    // Non-admin items remain
    expect(html).toContain('/products');
    expect(html).toContain('/reports');
  });

  it('marks a nested route as active on its parent item', () => {
    authState.role = 'ADMIN';
    const html = render({ path: '/products/abc-123', collapsed: false });
    // Exactly one aria-current="page"
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
    // And it is on the Products link (attribute order isn't guaranteed)
    const activeAnchor = html.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0] ?? '';
    expect(activeAnchor).toContain('href="/products"');
  });

  it('never marks two links active for a single path', () => {
    authState.role = 'ADMIN';
    for (const path of ['/', '/ledger', '/products', '/reports', '/settings']) {
      const html = render({ path, collapsed: false });
      const matches = html.match(/aria-current="page"/g) ?? [];
      expect(matches.length, `Expected exactly one active link for ${path}`).toBe(1);
    }
  });

  it('renders Arabic label text with dir="rtl" on its span only', () => {
    authState.role = 'ADMIN';
    const html = render({ path: '/', collapsed: false });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('الزبائن');
    // No layout-level dir attribute on the aside
    expect(html).not.toMatch(/<aside[^>]*dir="rtl"/);
  });

  it('shows a Sign out control accessible by role', () => {
    authState.role = 'ADMIN';
    const html = render({ path: '/', collapsed: false });
    expect(html).toContain('aria-label="Sign out"');
  });
});

describe('navigation helpers', () => {
  it('isPathActive treats "/" strictly', () => {
    expect(isPathActive('/', '/')).toBe(true);
    expect(isPathActive('/', '/products')).toBe(false);
  });

  it('isPathActive matches exact and nested paths', () => {
    expect(isPathActive('/products', '/products')).toBe(true);
    expect(isPathActive('/products', '/products/abc')).toBe(true);
    expect(isPathActive('/products', '/products-legacy')).toBe(false);
  });

  it('isItemVisible enforces role guard', () => {
    const admin: NavigationRole = 'ADMIN';
    const employee: NavigationRole = 'EMPLOYEE';
    expect(isItemVisible({ key: 'x', label: { en: 'x', ar: 'x' }, path: '/x', icon: {} as never }, employee)).toBe(true);
    expect(
      isItemVisible(
        { key: 'x', label: { en: 'x', ar: 'x' }, path: '/x', icon: {} as never, requiresRole: ['ADMIN'] },
        employee
      )
    ).toBe(false);
    expect(
      isItemVisible(
        { key: 'x', label: { en: 'x', ar: 'x' }, path: '/x', icon: {} as never, requiresRole: ['ADMIN'] },
        admin
      )
    ).toBe(true);
  });

  it('findActiveItem returns the deepest match', () => {
    const item = findActiveItem('/products/deep/child', 'ADMIN');
    expect(item?.key).toBe('products');
  });
});
