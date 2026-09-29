import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../context/AuthContext';
import { CategoriesPage } from '../../pages/products/CategoriesPage';
import type { Category } from './categories';

const render = (role: 'ADMIN' | 'EMPLOYEE', rows: Category[]) => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(['categories'], rows);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{
          user: { id: 'admin', username: 'admin', fullName: 'Admin', role },
          accessToken: 'unused',
          isAuthenticated: true,
          isLoading: false,
          login: vi.fn(),
          logout: vi.fn(),
          updateUser: vi.fn(),
        }}
      >
        <MemoryRouter>
          <CategoriesPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};
const row: Category = {
  id: 'c',
  name: 'Cookers',
  parentId: 'b',
  isActive: true,
  assignable: true,
  path: 'Home Appliances → Kitchen → Cookers',
  productCount: 2,
  childCount: 0,
  level: 3,
};
describe('English-only category management', () => {
  it('renders configurable nested categories and ADMIN maintenance controls in English', () => {
    const html = render('ADMIN', [row]);
    expect(html).toContain('Product categories');
    expect(html).toContain(row.path);
    expect(html).toContain('Add category');
    expect(html).toContain('Edit');
    expect(html).toContain('In-use categories cannot be deleted');
    expect(html).toContain('disabled=""');
    expect(html).not.toMatch(/[\u0600-\u06ff]/);
  });
  it('allows employees to read without exposing category mutation controls', () => {
    const html = render('EMPLOYEE', [row]);
    expect(html).toContain(row.path);
    expect(html).not.toContain('Add category');
    expect(html).not.toContain('Delete empty category');
    expect(html).not.toContain('>Edit<');
  });
  it('does not hardcode or seed example categories when settings are empty', () => {
    const html = render('ADMIN', []);
    expect(html).toContain('No categories yet');
    expect(html).not.toContain('Home Appliances');
    expect(html).not.toContain('Electronics');
  });
});
