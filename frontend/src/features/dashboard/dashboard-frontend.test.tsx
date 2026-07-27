import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './pages/DashboardPage';

const { dashboardHooksMock } = vi.hoisted(() => ({
  dashboardHooksMock: {
    useFinancialSummary: vi.fn(),
    useRecentActivity: vi.fn(),
  },
}));

vi.mock('./hooks/useDashboard', () => dashboardHooksMock);

const financialSummary = {
  businessDate: '2026-07-27',
  monthStart: '2026-07-01',
  counts: {
    totalCustomers: 2,
    customersWithOutstanding: 1,
  },
  money: {
    totalOutstanding: '500.00',
    paymentsToday: '50.00',
    paymentsThisMonth: '250.00',
    obligationsCreatedToday: '100.00',
    obligationsCreatedThisMonth: '900.00',
    netChangeToday: '50.00',
    netChangeThisMonth: '650.00',
  },
  upcomingDue: [
    {
      type: 'DEBT',
      id: 'debt-1',
      parentId: null,
      customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
      description: 'Television',
      dueDate: '2026-08-01',
      remainingAmount: '300.00',
      status: 'UNPAID',
    },
  ],
  overdueCustomers: [
    {
      customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
      overdueItemCount: 2,
      totalOverdue: '150.00',
    },
  ],
  recentPayments: [
    {
      id: 'payment-1',
      customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
      amount: '50.00',
      paymentDate: '2026-07-27',
      paymentMethod: 'CASH',
      reference: null,
      allocationCount: 1,
    },
  ],
};

describe('DashboardPage financial summary', () => {
  it('renders backend-formatted financial summary values and panels', () => {
    dashboardHooksMock.useFinancialSummary.mockReturnValue({
      data: financialSummary,
      isLoading: false,
    });
    dashboardHooksMock.useRecentActivity.mockReturnValue({
      data: [],
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(html).toContain('Total Outstanding Debt');
    expect(html).toContain('$500.00');
    expect(html).toContain('$250.00');
    expect(html).toContain('+$50.00');
    expect(html).toContain('Upcoming Due');
    expect(html).toContain('Overdue Customers');
    expect(html).toContain('border-emerald-200');
    expect(html).toContain('border-red-200');
    expect(html).toContain('Recent Payments');
    expect(html).toContain('Open Ledger');
    expect(html).toContain('Reports');
  });
});
