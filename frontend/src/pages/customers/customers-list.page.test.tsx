import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Customer } from '../../features/customers/api/customers.api';
import { CustomersListPage } from './CustomersListPage';

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../services/api', () => ({ api: apiMock }));

const customers: Customer[] = [
  {
    id: 'customer-1',
    name: 'محمد سالم عمار',
    phone: '70123456',
    address: null,
    notes: null,
    isActive: true,
    createdAt: '2026-05-01T08:00:00.000Z',
    updatedAt: '2026-05-01T08:00:00.000Z',
    matchedInNotesOnly: false,
    financial: {
      customerId: 'customer-1',
      tier: 'LATE',
      tierReason: '30 days late',
      totalObligated: '500.00',
      totalPaid: '200.00',
      outstanding: '300.00',
      overdueAmount: '120.00',
      openDebtCount: 2,
      activePlanCount: 1,
      overdueItemCount: 1,
      maxOverdueDays: 30,
      nextDueDate: '2026-08-20',
      lastPaymentDate: '2026-07-05',
      daysSinceLastPayment: 23,
    },
  },
  {
    id: 'customer-2',
    name: 'Carla Rizk',
    phone: '76333333',
    address: null,
    notes: null,
    isActive: false,
    createdAt: '2026-05-01T08:00:00.000Z',
    updatedAt: '2026-05-01T08:00:00.000Z',
    matchedInNotesOnly: true,
    financial: {
      customerId: 'customer-2',
      tier: 'CURRENT',
      tierReason: 'On track',
      totalObligated: '0.00',
      totalPaid: '0.00',
      outstanding: '0.00',
      overdueAmount: '0.00',
      openDebtCount: 0,
      activePlanCount: 0,
      overdueItemCount: 0,
      maxOverdueDays: 0,
      nextDueDate: null,
      lastPaymentDate: null,
      daysSinceLastPayment: null,
    },
  },
];

/**
 * Seeds the exact key the page's first render asks for, so the list renders
 * from data instead of a loading spinner. The empty `search` matches the
 * pre-debounce initial state.
 */
function renderPage(): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['customers', { page: 1, limit: 10, search: '', include: 'financial' }], {
    success: true,
    data: customers,
    meta: { pagination: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 } },
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CustomersListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CustomersListPage customer table', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps account totals out of the compact customer table', () => {
    const markup = renderPage();

    expect(markup).not.toContain('$300.00');
    expect(markup).not.toContain('$120.00');
    expect(markup).not.toContain('Outstanding /');
    expect(markup).not.toContain('Overdue /');
  });

  it('never fires a request per row while rendering', () => {
    renderPage();

    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it('shows obligation counts, next due and last payment for each customer', () => {
    const markup = renderPage();

    expect(markup).toContain('20/08/2026');
    expect(markup).toContain('05/07/2026');
    expect(markup).toContain('23 days ago');
  });

  it('uses English-only status and profile labels in the table', () => {
    const markup = renderPage();

    expect(markup).toContain('Active');
    expect(markup).toContain('Inactive');
    expect(markup).toContain('View profile');
    expect(markup).not.toContain('Active / نشط');
    expect(markup).not.toContain('View profile / عرض الملف');
  });

  it('keeps Arabic customer names direction-safe', () => {
    const markup = renderPage();

    expect(markup).toMatch(/dir="auto"[^>]*>محمد سالم عمار|محمد سالم عمار/);
    expect(markup).toContain('user-text');
  });

  it('formats local phone numbers as two-three-three digits', () => {
    expect(renderPage()).toContain('70-123-456');
  });

  it('renders the explainability hint only for a notes-only match', () => {
    const markup = renderPage();

    expect(markup.match(/Matched in notes/g)).toHaveLength(1);
  });

  it('provides a wheel-scroll region and glowing-yellow row hover styling', () => {
    const markup = renderPage();

    expect(markup).toContain('data-testid="customer-scroll-table"');
    expect(markup).toContain('overflow-y-auto');
    expect(markup).toContain('group-hover:text-yellow-300');
    expect(markup).toContain('text-shadow:0_0_8px');
  });
});
