import { formatMoney } from '../../../customer-financial/utils/financial-format';
import type { DashboardKpi } from '../../types';

const labels: Record<NonNullable<DashboardKpi['breakdown']>[number]['key'], string> = {
  depositsHeld: 'Deposits held',
  netBalance: 'Net',
};

/** Money shown under a KPI's value: deposits held are not debt, and the net is what customers owe overall. */
export function KpiBreakdown({ kpi, className }: { kpi: DashboardKpi; className?: string }) {
  if (!kpi.breakdown?.length) return null;
  return (
    <p className={className ?? 'mt-0.5 truncate text-xs tabular-nums text-slate-500'} data-testid={'kpi-breakdown-' + kpi.key}>
      {kpi.breakdown.map((item) => labels[item.key] + ' ' + formatMoney(item.value)).join(' · ')}
    </p>
  );
}
