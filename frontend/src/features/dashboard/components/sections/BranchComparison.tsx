import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../api/dashboard.api';
import type { DashboardFinancialSummary } from '../../types';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import { BranchBreakdownTable, type WithBranchBreakdown } from '../../../branches/scope/BranchBreakdownTable';
import { useShowBranchColumn } from '../../../branches/scope/branch-ui';

type FinancialFigures = Pick<DashboardFinancialSummary, 'counts' | 'money'>;

/**
 * Customer-side figures per branch, shown on the dashboard only in "All
 * branches". All amounts are the stored USD (base) amounts the server sums;
 * supplier payables per branch are on Reports → Analysis, and are never netted
 * against what customers owe.
 */
export function BranchComparison() {
  // Mount the loader only in "All branches": a single-branch dashboard makes no extra request.
  return useShowBranchColumn() ? <BranchComparisonLoader /> : null;
}

function BranchComparisonLoader() {
  const summary = useQuery({
    queryKey: ['dashboard', 'financial-summary', 'branch-comparison'],
    queryFn: () => dashboardApi.getFinancialSummary() as Promise<WithBranchBreakdown<DashboardFinancialSummary>>,
  });
  return summary.data ? <BranchComparisonTable summary={summary.data} /> : null;
}

export function BranchComparisonTable({ summary }: { summary: WithBranchBreakdown<DashboardFinancialSummary> }) {
  return (
    <BranchBreakdownTable<FinancialFigures>
      title="By branch / حسب الفرع"
      description="Customer balances and this month's activity, in USD at the rates recorded on each transaction."
      total={summary}
      rows={summary.branchBreakdown}
      metrics={[
        { label: 'Customers owe us', numeric: true, value: (figures) => formatMoney(figures.money.totalOutstanding) },
        { label: 'Customers with balance', numeric: true, value: (figures) => figures.counts.customersWithOutstanding },
        { label: 'Payments this month', numeric: true, value: (figures) => formatMoney(figures.money.paymentsThisMonth) },
        { label: 'New debt this month', numeric: true, value: (figures) => formatMoney(figures.money.obligationsCreatedThisMonth) },
      ]}
    />
  );
}
