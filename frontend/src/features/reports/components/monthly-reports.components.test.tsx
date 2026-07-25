import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MonthlyActivityReportTable } from './MonthlyActivityReportTable';
import { MonthlyDebtReportFilters } from './MonthlyDebtReportFilters';
import { MonthlyDebtReportTable } from './MonthlyDebtReportTable';
import { MonthlyActivitySummaryCards, MonthlyDebtSummaryCards } from './ReportSummaryCards';
import { ReportEmptyState, ReportErrorState, ReportLoadingState } from './ReportStates';
import {
  MonthlyDebtReportData,
  MonthlyFinancialActivityData,
} from '../types/monthly-reports.types';

const debtReport: MonthlyDebtReportData = {
  mode: 'SNAPSHOT',
  summary: {
    month: '2026-07',
    cutoffDate: '2026-07-31',
    customerCount: 10,
    totalOutstanding: '13420.00',
    singleDebtOutstandingTotal: '7000.00',
    installmentPlanOutstandingTotal: '6420.00',
    totalAmountDueByCutoff: '4800.00',
    totalOverdueAtCutoff: '1200.00',
    totalPaymentsReceivedDuringMonth: '900.00',
    customersWithOverdueDebt: 3,
    customersWithActiveInstallmentPlans: 5,
  },
  rows: [
    {
      customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
      singleDebtOutstanding: '450.00',
      installmentPlanOutstanding: '600.00',
      totalOutstanding: '1050.00',
      amountDueByCutoff: '550.00',
      overdueAmountAtCutoff: '200.00',
      activeDebtCount: 2,
      activePlanCount: 1,
      overdueDebtCount: 1,
      overdueInstallmentCount: 2,
      lastPaymentDate: '2026-07-20',
      nextDueDateAfterCutoff: '2026-08-15',
    },
  ],
  pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
};

const activityReport: MonthlyFinancialActivityData = {
  summary: {
    month: '2026-07',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    newSingleDebtAmount: '500.00',
    newInstallmentPlanAmount: '600.00',
    paymentsReceived: '200.00',
    netFinancialChange: '900.00',
    debtsCreated: 1,
    plansCreated: 1,
    payments: 1,
    customerCountAffected: 1,
  },
  items: [
    {
      id: 'payment-1',
      customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456' },
      type: 'PAYMENT_RECEIVED',
      date: '2026-07-20',
      description: 'Receipt 1',
      amount: '200.00',
    },
  ],
  pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
};

describe('monthly report components', () => {
  it('renders backend summary totals without relying on paginated row sums', () => {
    const cardsHtml = renderToStaticMarkup(<MonthlyDebtSummaryCards summary={debtReport.summary} />);
    const tableHtml = renderToStaticMarkup(
      <MonthlyDebtReportTable report={debtReport} onOpenCustomer={() => undefined} />
    );

    expect(cardsHtml).toContain('$13,420.00');
    expect(cardsHtml).toContain('Customers with Debt');
    expect(tableHtml).toContain('Ali Ahmad');
    expect(tableHtml).toContain('$1,050.00');
    expect(tableHtml).toContain('Total customers: 10');
    expect(tableHtml).toContain('$13,420.00');
  });

  it('renders filters including month, overdue, search, and cancelled controls', () => {
    const html = renderToStaticMarkup(
      <MonthlyDebtReportFilters
        filters={{ month: '2026-07', overdueOnly: true }}
        onChange={() => undefined}
        onRefresh={() => undefined}
      />
    );

    expect(html).toContain('type="month"');
    expect(html).toContain('Show only overdue');
    expect(html).toContain('Customer search');
    expect(html).toContain('Include cancelled');
  });

  it('renders activity summary and activity rows separately', () => {
    const summaryHtml = renderToStaticMarkup(<MonthlyActivitySummaryCards summary={activityReport.summary} />);
    const tableHtml = renderToStaticMarkup(<MonthlyActivityReportTable report={activityReport} />);

    expect(summaryHtml).toContain('Net Change');
    expect(summaryHtml).toContain('$900.00');
    expect(tableHtml).toContain('Payment received');
    expect(tableHtml).toContain('Receipt 1');
  });

  it('renders report states', () => {
    const loadingHtml = renderToStaticMarkup(<ReportLoadingState />);
    const errorHtml = renderToStaticMarkup(<ReportErrorState onRetry={vi.fn()} />);
    const emptyHtml = renderToStaticMarkup(<ReportEmptyState />);

    expect(loadingHtml).toContain('animate-pulse');
    expect(errorHtml).toContain('Report failed to load');
    expect(emptyHtml).toContain('No report rows');
  });
});
