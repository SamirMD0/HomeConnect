import { describe, expect, it } from 'vitest';
import { cellFor, displayValue, reportColumns, summaryFor } from '@shared/report-columns';
import { buildReportHtml } from './report-pdf';

const debtRow = {
  customer: { id: 'c1', name: 'مايا دمج', phone: null },
  singleDebtOutstanding: '3170.00',
  installmentPlanOutstanding: '0.00',
  totalOutstanding: '3170.00',
  amountDueByCutoff: '3170.00',
  overdueAmountAtCutoff: '3170.00',
  activeDebtCount: 1,
  activePlanCount: 0,
  lastPaymentDate: '2026-10-02',
};
const debtSummary = {
  month: '2026-11',
  cutoffDate: '2026-11-14',
  customerCount: 102,
  totalOutstanding: '36817.94',
  totalAmountDueByCutoff: '33083.94',
  totalOverdueAtCutoff: '33083.94',
  totalPaymentsReceivedDuringMonth: '6379.96',
  customersWithOverdueDebt: 90,
};

describe('monthly customer debts (the report in the field screenshot)', () => {
  it('shows the PC columns, formatted, instead of every raw field', () => {
    const columns = reportColumns('monthly-debts');
    expect(columns.map((column) => column.label)).toEqual([
      'Customer', 'Phone', 'Single Debts', 'Installment Plans', 'Total Outstanding',
      'Due by Cutoff', 'Overdue', 'Active Obligations', 'Last Payment',
    ]);
    const cells = columns.map((column) => cellFor(column, debtRow).text);
    expect(cells[0]).toBe('مايا دمج');
    expect(cells[1]).toBe('—');
    expect(cells[4]).toBe('$3,170.00');
    expect(cells[7]).toBe('1 debts · 0 plans');
    expect(cells[8]).toBe('02/10/2026');
  });

  it('formats every money headline the same way (no bare 33083.94)', () => {
    const figures = summaryFor('monthly-debts', debtSummary);
    expect(figures.map((figure) => [figure.label, figure.text])).toEqual([
      ['Customers', '102'],
      ['Total outstanding', '$36,817.94'],
      ['Due by cutoff', '$33,083.94'],
      ['Overdue', '$33,083.94'],
      ['Paid this month', '$6,379.96'],
    ]);
  });
});

describe('cells', () => {
  it('humanises statuses and tones them, never by colour alone', () => {
    const [status] = reportColumns('sales-orders').filter((column) => column.label === 'Payment');
    expect(cellFor(status!, { paymentStatus: 'PARTIALLY_PAID' })).toEqual({ text: 'Partially paid', tone: 'warn' });
    expect(cellFor(status!, { paymentStatus: 'PAID' })).toEqual({ text: 'Paid', tone: 'good' });
    const lowStock = reportColumns('inventory-low-stock').find((column) => column.label === 'Status')!;
    expect(cellFor(lowStock, { status: 'OUT_OF_STOCK' }).tone).toBe('warn');
    expect(cellFor(lowStock, { status: 'LOW_STOCK' }).tone).toBe('good');
  });

  it('shows Walk-in for a sale without a customer and signs cash flow', () => {
    const customer = reportColumns('sales-by-customer')[0]!;
    expect(cellFor(customer, { customer: null }).text).toBe('Walk-in');
    const net = reportColumns('cash-flow').find((column) => column.label === 'Net cash flow')!;
    expect(cellFor(net, { netCashFlow: '-20.00' }).tone).toBe('bad');
  });

  it('keeps currency codes and dates readable', () => {
    expect(displayValue('USD')).toBe('USD');
    expect(displayValue('2026-11-14')).toBe('14/11/2026');
    expect(displayValue(true)).toBe('Active');
    expect(displayValue(null)).toBe('—');
  });
});

describe('PDF export', () => {
  it('prints the same columns and figures, escaped, landscape A4', () => {
    const html = buildReportHtml({
      title: 'Customer <Debts>',
      period: 'November 2026',
      branch: 'Jadra',
      summary: summaryFor('monthly-debts', debtSummary),
      columns: reportColumns('monthly-debts'),
      rows: [debtRow],
      generatedAt: new Date('2026-11-14T10:00:00Z'),
    });
    expect(html).toContain('size: A4 landscape');
    expect(html).toContain('Customer &lt;Debts&gt;');
    expect(html).toContain('<th class="num">Total Outstanding</th>');
    expect(html).toContain('$36,817.94');
    expect(html).toContain('مايا دمج');
    expect(html).toContain('Jadra');
    expect(html).toContain('1 rows');
  });
});
