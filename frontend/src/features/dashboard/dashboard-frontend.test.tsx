import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './pages/DashboardPage';

const { hooks } = vi.hoisted(() => ({ hooks: {
  useDashboardOverview: vi.fn(), useCustomerAnalytics: vi.fn(), useSupplierAnalytics: vi.fn(),
  useServiceAnalytics: vi.fn(), useProductAnalytics: vi.fn(), useDashboardAlerts: vi.fn(),
  useDashboardActivity: vi.fn(), useMonthEnd: vi.fn(), useRefreshDashboard: vi.fn(),
} }));
vi.mock('./hooks/useDashboard', () => hooks);
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'ADMIN' } }) }));

const meta = { businessDate: '2026-08-01', range: { from: '2026-08-01', to: '2026-08-01', preset: 'month' }, generatedAt: '2026-08-01T10:00:00Z', currency: 'USD' };
const result = <T,>(data: T) => ({ data: { meta, data }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() });

describe('ERP DashboardPage', () => {
  it('renders the eight KPIs, bilingual sections, quick actions, and analytics', () => {
    hooks.useRefreshDashboard.mockReturnValue(vi.fn());
    hooks.useDashboardOverview.mockReturnValue(result({ kpis: ['collectedToday','customersPaidToday','newDebtsToday','outstandingDebt','owedToSuppliers','openServiceJobs','readyForPickup','activeProducts'].map((key, index) => ({ key, value: index % 3 === 0 ? '100.00' : index, valueKind: index % 3 === 0 ? 'money' : 'count', goodDirection: 'neutral', route: '/', sparkline: [] })), moduleCounts: {} }));
    hooks.useCustomerAnalytics.mockReturnValue(result({ totals: { totalCustomers: 0, collected: '0.00', distinctPayers: 0, newDebt: '0.00', outstanding: '0.00', customersWithBalance: 0, overdueCustomers: 0, netMovement: '0.00' }, today: { collected: '0.00', distinctPayers: 0, newDebt: '0.00' }, trend: [{ bucket: '2026-08-01', collected: '10.00', newDebt: '20.00' }], monthlyComparison: [], ageDistribution: [], topDebtors: [] }));
    hooks.useSupplierAnalytics.mockReturnValue(result({ totals: { owed: '0.00', paid: '0.00', paidToday: '0.00', suppliersWithBalance: 0 }, trend: [], topBalances: [] }));
    hooks.useServiceAnalytics.mockReturnValue(result({ totals: { all: 0, open: 0, readyForPickup: 0, completed: 0, aging: 0 }, statusDistribution: [], throughput: [], agingJobs: [] }));
    hooks.useProductAnalytics.mockReturnValue(result({ totals: { active: 0, archived: 0, missingBarcode: 0, missingCost: 0, missingPricing: 0, ready: 0, readinessPercent: 100 }, presetUsage: [] }));
    hooks.useDashboardAlerts.mockReturnValue(result({ alerts: [], total: 0 }));
    hooks.useDashboardActivity.mockReturnValue(result({ items: [] }));
    hooks.useMonthEnd.mockReturnValue(result({ month: '2026-08', disclosure: { en: 'Computed', ar: 'محسوبة' }, customers: { opening: '0.00', newAmount: '0.00', collected: '0.00', adjustments: '0.00', closing: '0.00', reconciled: true, withDebt: 0, fullyPaid: 0, overdue: 0 }, suppliers: { opening: '0.00', newAmount: '0.00', collected: '0.00', adjustments: '0.00', closing: '0.00', reconciled: true, withBalance: 0 }, service: { opened: 0, completed: 0, pending: 0, cancelled: 0, netOpen: 0, averageDaysOpen: 0 } }));

    const html = renderToStaticMarkup(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect((html.match(/dashboard-kpi-card/g) ?? [])).toHaveLength(8);
    expect(html).toContain('Customer Analytics');
    expect(html).toContain('تحليلات الزبائن');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('Add Service Job');
    expect(html).toContain('Collections vs New Debt');
    expect(html).toContain('View as table');
    expect(html).toContain('End of Month Status');
    expect(html).toContain('System Modules');
  });
});
