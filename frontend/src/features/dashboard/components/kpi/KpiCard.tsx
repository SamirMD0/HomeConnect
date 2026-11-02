import { Link } from 'react-router-dom';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import { dashboardLabels } from '../../config/dashboard-labels';
import { dashboardKpiIcons } from '../../config/module-registry';
import type { DashboardKpi } from '../../types';
import { BilingualLabel } from '../layout/BilingualLabel';
import { DeltaChip, sparklineDeltaPercent } from './DeltaChip';

/**
 * Semantic tone per KPI. Only the icon carries the colour, so a row of them
 * says what each number is about without becoming a patchwork.
 */
const kpiTone: Record<DashboardKpi['key'], 'brand' | 'info' | 'success' | 'warning' | 'danger'> = {
  collectedToday: 'success',
  customersPaidToday: 'info',
  newDebtsToday: 'warning',
  outstandingDebt: 'danger',
  owedToSuppliers: 'warning',
  openServiceJobs: 'info',
  readyForPickup: 'success',
  activeProducts: 'brand',
};

const toneChip = {
  brand: 'bg-brand-500/15 text-brand-700',
  info: 'bg-sky-500/15 text-sky-700',
  success: 'bg-emerald-500/15 text-emerald-700',
  warning: 'bg-amber-500/15 text-amber-700',
  danger: 'bg-red-500/15 text-red-700',
} as const;

export function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  const Icon = dashboardKpiIcons[kpi.key];
  const value = kpi.valueKind === 'money' ? formatMoney(String(kpi.value)) : String(kpi.value);
  const delta = sparklineDeltaPercent(kpi.sparkline);
  return (
    <Link
      to={kpi.route}
      className="group flex min-w-0 items-center gap-3 p-5 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 lg:px-8"
    >
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${toneChip[kpiTone[kpi.key]]}`} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate text-xl font-bold leading-tight tabular-nums text-slate-900" title={value}>
            {value}
          </span>
          {Number.isFinite(delta) && <DeltaChip percent={delta} goodDirection={kpi.goodDirection} />}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-600">
          <BilingualLabel label={dashboardLabels[kpi.key]} compact />
        </p>
      </div>
    </Link>
  );
}
