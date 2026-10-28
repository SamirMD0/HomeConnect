import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BranchBreakdownTable } from './BranchBreakdownTable';
import { BranchComparisonTable } from '../../dashboard/components/sections/BranchComparison';
import type { DashboardFinancialSummary } from '../../dashboard/types';

type Figures = { owed: string; count: number };
const metrics = [
  { label: 'Owed', numeric: true, value: (f: Figures) => f.owed },
  { label: 'Customers', numeric: true, value: (f: Figures) => f.count },
];
const rowA = { branchId: 'a', branchCode: 'MAIN', branchName: 'Main branch', owed: '80.00', count: 2 };
const rowB = { branchId: 'b', branchCode: 'TYRE', branchName: 'فرع صور', owed: '160.00', count: 3 };

describe('BranchBreakdownTable', () => {
  it('renders nothing without a breakdown (one branch, or a single-branch scope)', () => {
    expect(renderToStaticMarkup(<BranchBreakdownTable title="By branch" total={{ owed: '80.00', count: 2 }} rows={undefined} metrics={metrics} />)).toBe('');
    expect(renderToStaticMarkup(<BranchBreakdownTable title="By branch" total={{ owed: '80.00', count: 2 }} rows={[rowA]} metrics={metrics} />)).toBe('');
  });

  it('lists each branch and shows the server total, not a client-side sum', () => {
    // A deliberately different total proves the footer is the server's figure.
    const html = renderToStaticMarkup(
      <BranchBreakdownTable title="By branch" total={{ owed: '240.00', count: 5 }} rows={[rowA, rowB]} metrics={metrics} />
    );
    expect(html).toContain('Main branch');
    expect(html).toContain('فرع صور');
    expect(html).toContain('dir="auto"');
    expect(html).toContain('80.00');
    expect(html).toContain('160.00');
    expect(html).toContain('All branches');
    expect(html).toMatch(/All branches<\/th><td[^>]*>240\.00<\/td><td[^>]*>5<\/td>/);
  });
});

describe('BranchComparisonTable (dashboard)', () => {
  const figures = (owed: string, paid: string, created: string, withBalance: number) => ({
    counts: { totalCustomers: 10, customersWithOutstanding: withBalance },
    money: {
      totalOutstanding: owed, paymentsToday: '0.00', paymentsThisMonth: paid, obligationsCreatedToday: '0.00',
      obligationsCreatedThisMonth: created, netChangeToday: '0.00', netChangeThisMonth: '0.00',
    },
  });
  const summary = {
    businessDate: '2026-10-28', monthStart: '2026-10-01', upcomingDue: [], overdueCustomers: [], recentPayments: [],
    ...figures('240.00', '50.00', '30.00', 5),
    branchBreakdown: [
      { branchId: 'a', branchCode: 'MAIN', branchName: 'Main branch', ...figures('80.00', '20.00', '10.00', 2) },
      { branchId: 'b', branchCode: 'TYRE', branchName: 'Tyre', ...figures('160.00', '30.00', '20.00', 3) },
    ],
  } as unknown as DashboardFinancialSummary & { branchBreakdown: never };

  it('shows customer balances per branch and the server total, labelled as what customers owe', () => {
    const html = renderToStaticMarkup(<BranchComparisonTable summary={summary} />);
    expect(html).toContain('Customers owe us');
    expect(html).toContain('Tyre');
    expect(html).toContain('$240.00');
    expect(html).not.toMatch(/payable/i);
  });
});
