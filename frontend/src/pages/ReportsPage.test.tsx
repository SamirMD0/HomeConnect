import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, review } = vi.hoisted(() => ({
  auth: { user: { role: 'ADMIN' } as { role: 'ADMIN' | 'EMPLOYEE' } },
  review: { data: undefined as unknown },
}));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../features/reports/hooks/useMonthlyReview', () => ({
  useMonthlyReview: () => review,
}));

import { ReportsPage } from './ReportsPage';
import { reportDefinitions } from '../features/reports/reports.registry';

describe('Reports portal', () => {
  beforeEach(() => {
    auth.user = { role: 'ADMIN' };
    review.data = undefined;
  });

  it('lists every report as a card that links to its own page', () => {
    const html = renderPage();

    expect(html).toContain('Reports / التقارير');
    for (const definition of reportDefinitions) {
      expect(html).toContain(definition.title);
      expect(html).toContain(`href="/reports/${definition.id}"`);
    }
    expect(html).toContain('View report / عرض التقرير');
  });

  it('groups the cards under report categories', () => {
    const html = renderPage();

    for (const label of ['Overview / نظرة عامة', 'Customers / الزبائن', 'Suppliers / الموردون', 'Sales / المبيعات', 'Inventory / المخزون']) {
      expect(html).toContain(label);
    }
  });

  /**
   * The portal is a chooser, not a report. Tables, period pickers, and exports
   * belong to the report page — putting them here is what made the old screen
   * read as a dashboard.
   */
  it('renders no tables, no period selector, and no export control', () => {
    const html = renderPage();

    expect(html).not.toContain('<table');
    expect(html).not.toContain('This month / هذا الشهر');
    expect(html).not.toContain('Export PDF / تصدير PDF');
    expect(html).not.toContain('Export CSV / تصدير CSV');
  });

  it('shows a backend-supplied headline figure and never invents one', () => {
    expect(renderPage()).not.toContain('Sales / المبيعات</p>');

    review.data = {
      meta: {},
      data: {
        sales: { totalAmount: '1250.00', orderCount: 7, unpaidAmount: '300.00' },
        customers: { newCustomers: 4, movement: { closing: '890.00', collected: '210.00' } },
        suppliers: { movement: { closing: '640.00' } },
      },
    };
    const html = renderPage();

    expect(html).toContain('1,250.00');
    expect(html).toContain('890.00');
    expect(html).toContain('4');
  });

  it('shows the admin-only notice to an employee', () => {
    auth.user = { role: 'EMPLOYEE' };

    const html = renderPage();

    expect(html).toContain('Reports are admin-only');
    expect(html).not.toContain('View report / عرض التقرير');
  });
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
