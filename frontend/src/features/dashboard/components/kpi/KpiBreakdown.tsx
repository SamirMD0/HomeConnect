import { formatMoney } from '../../../customer-financial/utils/financial-format';
import type { DashboardKpi } from '../../types';

const labels: Record<NonNullable<DashboardKpi['breakdown']>[number]['key'], string> = {
  debts: 'Debts',
  customerCredit: 'Customer credit',
  prepaidHeld: 'Prepaid orders held',
};

/** What a KPI's value is made of: debts less customer credit, with prepaid money held apart. */
export function KpiBreakdown({ kpi, className }: { kpi: DashboardKpi; className?: string }) {
  if (!kpi.breakdown?.length) return null;
  return (
    <p
      className={className ?? 'mt-0.5 truncate text-xs tabular-nums text-slate-500'}
      data-testid={'kpi-breakdown-' + kpi.key}
    >
      {kpi.breakdown.map((item, index) => (
        <span key={item.key}>
          {index > 0 && ' · '}
          {labels[item.key] + ' '}
          {/* An amount never breaks across lines, sign included. */}
          <span className="whitespace-nowrap">
            {(item.key === 'customerCredit' ? '−' : '') + formatMoney(item.value)}
          </span>
        </span>
      ))}
    </p>
  );
}
