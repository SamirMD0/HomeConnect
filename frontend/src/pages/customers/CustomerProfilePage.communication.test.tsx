import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const customer = {
  id: 'customer-1',
  name: 'محمد سالم عمار',
  phone: '70123456',
  address: null,
  notes: null,
  isActive: true,
  createdAt: '2026-05-02T09:15:00.000Z',
  updatedAt: '2026-05-02T09:15:00.000Z',
};

vi.mock('../../features/customers/hooks/useCustomers', () => ({
  useCustomer: () => ({ data: customer, isLoading: false, isError: false }),
  useUpdateCustomer: () => ({ mutate: () => undefined, isPending: false }),
  useDeleteCustomer: () => ({ mutate: () => undefined, isPending: false }),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'EMPLOYEE', name: 'Employee' } }),
}));

const { CustomerProfilePage } = await import('./CustomerProfilePage');

function renderProfile(): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/customers/customer-1']}>
        <Routes>
          <Route path="/customers/:id" element={<CustomerProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('customer profile — communication section placement', () => {
  it('mounts the collapsed communication section between financial actions and the tabs', () => {
    const html = renderProfile();

    const financialActions = html.indexOf('Financial Actions / الإجراءات المالية');
    const communication = html.indexOf('Customer Communication / تواصل الزبون');

    expect(financialActions).toBeGreaterThan(-1);
    expect(communication).toBeGreaterThan(financialActions);
    expect(html).toContain('aria-expanded="false"');
    // Collapsed: the composer is not rendered.
    expect(html).not.toContain('Message type / نوع الرسالة');
  });

  it('offers a WhatsApp shortcut in the header that cannot open WhatsApp directly', () => {
    const html = renderProfile();

    expect(html).toContain('aria-label="Prepare WhatsApp message / تحضير رسالة واتساب"');
    // No link, no target=_blank, no deep link anywhere on the page: the shortcut
    // only expands the section so the employee reviews the message first.
    expect(html).not.toContain('wa.me');
    expect(html).not.toContain('whatsapp://');
    expect(html).not.toContain('target="_blank"');
  });

  it('keeps the existing financial profile and customer sections rendering', () => {
    const html = renderProfile();

    expect(html).toContain('Customer Profile / ملف الزبون');
    expect(html).toContain('Copy phone / نسخ الهاتف');
    expect(html).toContain('Service Jobs / طلبات الصيانة');
  });
});
