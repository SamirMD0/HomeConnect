import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, rows, exportCsv } = vi.hoisted(() => ({
  auth: { user: { role: 'ADMIN' } as { role: 'ADMIN' | 'EMPLOYEE' } },
  rows: { value: undefined as unknown },
  exportCsv: vi.fn(),
}));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('../features/reports/hooks/useReportRows', () => ({ useReportRows: () => rows.value }));
vi.mock('../features/reports/components/MonthlyReview', () => ({ MonthlyReview: () => <div>Monthly Review Loaded</div> }));
vi.mock('../features/reports/components/AnalysisPortal', () => ({ AnalysisPortal: () => <div>Analysis Portal Loaded</div> }));
vi.mock('../features/reports/hooks/useAnalysis', () => ({ useAnalysis: () => ({ data: undefined, isFetching: false, refetch: vi.fn() }) }));
vi.mock('../features/reports/api/report-rows.api', () => ({ reportRowsApi: { exportCsv } }));

import { ReportDetailPage } from './ReportDetailPage';
import { reportDefinitions } from '../features/reports/reports.registry';

const meta = { from: '2026-08-01', to: '2026-08-17', previousFrom: '2026-07-15', previousTo: '2026-07-31', preset: 'thisMonth', generatedAt: '2026-08-17T09:00:00.000Z', currency: 'USD' };

const populated = {
  data: { meta, data: { summary: { count: 2, totalAmount: '450.00' }, rows: [
    { id: 'p1', customer: { id: 'c1', name: 'Rami' }, amount: '250.00', paymentDate: '2026-08-05', paymentMethod: 'CASH', reference: 'R-1' },
    { id: 'p2', customer: { id: 'c2', name: 'ليلى' }, amount: '200.00', paymentDate: '2026-08-09', paymentMethod: 'CASH', reference: null },
  ] } },
  isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
};

describe('Report detail page', () => {
  beforeEach(() => {
    auth.user = { role: 'ADMIN' };
    rows.value = populated;
  });

  it('renders one report with its title, period, totals, and full table', () => {
    const html = render('customer-payments');

    expect(html).toContain('Customer Payments / دفعات الزبائن');
    expect(html).toContain('Reporting period / فترة التقرير');
    expect(html).toContain('2026-08-01');
    expect(html).toContain('2026-08-17');
    expect(html).toContain('Collected / المحصل');
    expect(html).toContain('<table');
    expect(html).toContain('Rami');
    expect(html).toContain('ليلى');
    expect(html).toContain('250.00');
    expect(html).toContain('2 rows');
  });

  it('gives the report its own export controls and a way back to the portal', () => {
    const html = render('customer-payments');

    expect(html).toContain('Export PDF / تصدير PDF');
    expect(html).toContain('Export CSV / تصدير CSV');
    expect(html).toContain('All reports / كل التقارير');
    expect(html).toContain('href="/reports"');
  });

  /**
   * The export must cover the open report only. The route renders exactly one
   * report, so no other report's markup can be present to export.
   */
  it('renders only the requested report, never another report body', () => {
    const html = render('customer-payments');

    expect(html).toContain('Customer Payments / دفعات الزبائن');
    for (const other of reportDefinitions.filter((definition) => definition.id !== 'customer-payments')) {
      expect(html).not.toContain(other.title);
    }
    expect(html).not.toContain('Monthly Review Loaded');
  });

  it('offers a period selector on the report itself', () => {
    const html = render('customer-payments');

    expect(html).toContain('This month / هذا الشهر');
    expect(html).toContain('Last month / الشهر الماضي');
    expect(html).toContain('Custom / مخصص');
  });

  it('renders the monthly review body for the review report', () => {
    const html = render('monthly-review');

    expect(html).toContain('Monthly Review Loaded');
    expect(html).toContain('Monthly Review / المراجعة الشهرية');
  });

  it('renders empty, loading, and error states', () => {
    rows.value = { ...populated, data: { meta, data: { summary: {}, rows: [] } } };
    expect(render('customer-payments')).toContain('No report rows');

    rows.value = { data: undefined, isLoading: true, isError: false, isFetching: true, refetch: vi.fn() };
    expect(render('customer-payments')).toContain('animate-pulse');

    rows.value = { data: undefined, isLoading: false, isError: true, isFetching: false, refetch: vi.fn() };
    expect(render('customer-payments')).toContain('Report failed to load');
  });

  it('marks an operational backlog so it is not read as a period record', () => {
    expect(render('unpaid-sales')).toContain('current operational backlog');
    expect(render('customer-payments')).not.toContain('current operational backlog');
  });

  it('shows the admin-only notice to an employee', () => {
    auth.user = { role: 'EMPLOYEE' };

    const html = render('customer-payments');

    expect(html).toContain('Reports are admin-only');
    expect(html).not.toContain('<table');
  });

  it('opens the analysis portal on its own page with its own export', () => {
    const html = render('analysis');

    expect(html).toContain('Analysis Portal / بوابة التحليل');
    expect(html).toContain('Analysis Portal Loaded');
    expect(html).toContain('Export PDF / تصدير PDF');
    expect(html).not.toContain('Monthly Review Loaded');
  });
});

/**
 * The four ERP reports added in this checkpoint. Each is a normal rows report,
 * so it inherits the period selector, totals, table, and per-report export.
 */
describe('Report detail page — ERP reports', () => {
  beforeEach(() => { auth.user = { role: 'ADMIN' }; });

  it('renders receivables aging with its bands, days unpaid, and remaining balance', () => {
    rows.value = withRows(
      { totalReceivables: '250.00', totalOverdue: '200.00', customersOwing: 2, over30: '200.00', over60: '200.00', over90: '200.00' },
      [{ debtId: 'd1', customer: { id: 'c1', name: 'Rami', phone: '70' }, description: 'Fridge', reference: 'SO-1', createdOn: '2026-05-01', dueDate: '2026-05-20', originalAmount: '200.00', paidAmount: '0.00', remainingAmount: '200.00', daysUnpaid: 108, bucket: 'DAYS_90_PLUS', lastPaymentDate: null, status: 'OVERDUE' }]
    );
    const html = render('receivables-aging');

    expect(html).toContain('Receivables Aging / أعمار ديون الزبائن');
    expect(html).toContain('Total receivables / إجمالي الذمم');
    expect(html).toContain('Over 90 days / أكثر من ٩٠ يوم');
    expect(html).toContain('90+ days / ٩٠+');
    expect(html).toContain('108');
    expect(html).toContain('OVERDUE');
    expect(html).toContain('Rami');
  });

  it('renders customers who did not pay with movement columns and risk labels', () => {
    rows.value = withRows(
      { count: 1, openingBalance: '100.00', newDebt: '50.00', closingBalance: '150.00', withOldBalance: 1 },
      [{ customer: { id: 'c1', name: 'Ali', phone: '71' }, openingBalance: '100.00', newDebt: '50.00', paidInPeriod: '0.00', closingBalance: '150.00', paymentCount: 0, unpaidDebtCount: 2, lastPaymentDate: '2026-05-01', daysSinceLastPayment: 108, riskLabels: ['NO_PAYMENT_THIS_PERIOD', 'DEBT_INCREASED'] }]
    );
    const html = render('customers-not-paid');

    expect(html).toContain('Customers Who Did Not Pay / زبائن لم يدفعوا');
    expect(html).toContain('Opening / الافتتاحي');
    expect(html).toContain('Closing / الختامي');
    expect(html).toContain('No payment this month / لم يدفع هذا الشهر');
    expect(html).toContain('Debt increased / الدين ازداد');
  });

  it('renders customers who paid with their payment counts', () => {
    rows.value = withRows(
      { count: 1, paymentCount: 2, paidInPeriod: '30.00', closingBalance: '20.00' },
      [{ customer: { id: 'c2', name: 'Maya', phone: '72' }, openingBalance: '50.00', newDebt: '0.00', paidInPeriod: '30.00', closingBalance: '20.00', paymentCount: 2, unpaidDebtCount: 1, lastPaymentDate: '2026-08-10', daysSinceLastPayment: 7, riskLabels: [] }]
    );
    const html = render('customers-paid');

    expect(html).toContain('Customers Who Paid / زبائن دفعوا');
    expect(html).toContain('Payments / الدفعات');
    expect(html).toContain('Maya');
  });

  /** Receiving records no cost, so the report must never imply a purchase value. */
  it('renders products bought in quantities only, with no cost or value column', () => {
    rows.value = withRows(
      { activeLines: 1, totalUnits: 10, distinctProducts: 1, receivedNotSold: 1, reversedLines: 0, valuation: 'NOT_AVAILABLE' },
      [{ itemId: 'i1', product: { id: 'p1', name: 'Fan', sku: 'SKU-1' }, sku: 'SKU-1', barcode: null, currentStock: 12, supplier: { id: 's1', name: 'Supplier One' }, receivingId: 'r1', referenceNumber: 'INV-1', receivedOn: '2026-08-02', quantity: 10, status: 'ACTIVE', soldInPeriod: 0, linkedDebt: null }]
    );
    const html = render('products-bought');

    expect(html).toContain('Products Bought / المنتجات المشتراة');
    expect(html).toContain('Total units / إجمالي الوحدات');
    expect(html).toContain('Received not sold / لم تُبع');
    expect(html).toContain('Fan');
    for (const forbidden of ['Cost / التكلفة', 'Purchase value', 'Unit price', 'قيمة الشراء']) {
      expect(html).not.toContain(forbidden);
    }
  });

  it('gives every new report its own export controls', () => {
    rows.value = withRows({ count: 0 }, [{ debtId: 'd1', customer: { id: 'c1', name: 'Rami', phone: '70' }, description: 'x', reference: null, createdOn: '2026-08-01', dueDate: '2026-08-20', originalAmount: '10.00', paidAmount: '0.00', remainingAmount: '10.00', daysUnpaid: 3, bucket: 'DAYS_0_7', lastPaymentDate: null, status: 'UNPAID' }]);

    for (const reportId of ['receivables-aging', 'customers-not-paid', 'customers-paid', 'products-bought']) {
      const html = render(reportId);
      expect(html).toContain('Export PDF / تصدير PDF');
      expect(html).toContain('Export CSV / تصدير CSV');
    }
  });
});

function withRows(summary: Record<string, unknown>, tableRows: unknown[]) {
  return {
    data: { meta, data: { summary, rows: tableRows } },
    isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
  };
}

function render(reportId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/reports/${reportId}`]}>
        <Routes><Route path="/reports/:reportId" element={<ReportDetailPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
