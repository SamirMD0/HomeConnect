import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BranchScopeContext, type BranchScopeContextValue } from '../../../branches/scope/BranchScopeProvider';
import type { CustomerAnalyticsData, SupplierAnalyticsData } from '../../types';
import { BranchesOverview } from './BranchesOverview';

const customerFigures = (outstanding: string, collected: string, newDebt: string, trend: Array<[string, string, string]>): CustomerAnalyticsData => ({
  totals: { totalCustomers: 10, collected, distinctPayers: 2, newDebt, outstanding, customersWithBalance: 3, overdueCustomers: 1, netMovement: '0.00' },
  today: { collected: '0.00', distinctPayers: 0, newDebt: '0.00' },
  trend: trend.map(([bucket, c, d]) => ({ bucket, collected: c, newDebt: d })),
  monthlyComparison: [],
  ageDistribution: [],
});

const customer = {
  // Deliberately not the sum of the rows: the footer must show the server's own total.
  ...customerFigures('999.00', '70.00', '40.00', [['2026-10-01', '30', '10'], ['2026-10-02', '40', '30']]),
  branchBreakdown: [
    { branchId: 'a', branchCode: 'MAIN', branchName: 'Main branch', ...customerFigures('300.00', '30.00', '10.00', [['2026-10-01', '30', '10']]) },
    { branchId: 'b', branchCode: 'TYRE', branchName: 'فرع صور', ...customerFigures('400.00', '40.00', '30.00', [['2026-10-02', '40', '30']]) },
  ],
};

const supplierFigures = (owed: string, paid: string): SupplierAnalyticsData => ({
  totals: { owed, paid, paidToday: '0.00', suppliersWithBalance: 2 },
  trend: [],
  topBalances: [],
});
const supplier = {
  ...supplierFigures('500.00', '60.00'),
  branchBreakdown: [
    { branchId: 'a', branchCode: 'MAIN', branchName: 'Main branch', ...supplierFigures('200.00', '20.00') },
    { branchId: 'b', branchCode: 'TYRE', branchName: 'فرع صور', ...supplierFigures('300.00', '40.00') },
  ],
};

const scope: BranchScopeContextValue = { ready: true, branches: [], selection: { kind: 'all' }, selectedBranch: null, select: () => undefined };
const render = (props: Partial<Parameters<typeof BranchesOverview>[0]> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <BranchScopeContext.Provider value={scope}>
        <BranchesOverview customer={customer} supplier={supplier} isLoading={false} isError={false} onRetry={() => undefined} {...props} />
      </BranchScopeContext.Provider>
    </MemoryRouter>
  );

describe('BranchesOverview', () => {
  it('lists customer debts per branch with the server total in the footer', () => {
    const html = render();
    expect(html).toContain('Customer debts');
    expect(html).toContain('Main branch');
    expect(html).toContain('فرع صور');
    expect(html).toContain('dir="auto"');
    expect(html).toContain('$300.00');
    expect(html).toContain('$400.00');
    expect(html).toMatch(/All branches<\/th><td[^>]*>\$999\.00<\/td>/);
  });

  it('shows supplier balances in their own table, never netted against customer debt', () => {
    const html = render();
    expect(html).toContain('data-testid="branches-suppliers"');
    expect(html).toContain('We owe');
    expect(html).toMatch(/All branches<\/th><td[^>]*>\$500\.00<\/td>/);
  });

  it('offers a cash flow chart with collected, new debt and net metrics', () => {
    const html = render();
    expect(html).toContain('data-testid="branches-cash-flow"');
    expect(html).toContain('Cash flow by branch');
    for (const label of ['Collected', 'New debt', 'Net (collected − new debt)']) expect(html).toContain(label);
  });

  it('links each branch to its reports and ledger', () => {
    const html = render();
    expect((html.match(/<button[^>]*>Reports</g) ?? []).length).toBe(2);
    expect((html.match(/<button[^>]*>Ledger</g) ?? []).length).toBe(2);
  });

  it('explains itself instead of showing empty tables when there is no per-branch breakdown', () => {
    const html = render({ customer: { ...customer, branchBreakdown: undefined } });
    expect(html).toContain('two or more branches');
    expect(html).not.toContain('data-testid="branches-customer-debts"');
  });
});
