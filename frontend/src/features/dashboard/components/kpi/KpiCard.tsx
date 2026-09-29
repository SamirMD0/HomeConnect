import { Link } from 'react-router-dom';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import { dashboardLabels } from '../../config/dashboard-labels';
import { dashboardKpiIcons } from '../../config/module-registry';
import type { DashboardKpi } from '../../types';
import { BilingualLabel } from '../layout/BilingualLabel';
import { KpiSparkline } from './KpiSparkline';
import { DeltaChip, sparklineDeltaPercent } from './DeltaChip';

/**
 * Semantic tone per KPI. Icon chip picks up this colour; the card itself
 * stays white so a wall of 8 cards doesn't turn into a colour patchwork.
 */
const kpiTone: Record<DashboardKpi['key'], 'brand' | 'info' | 'warning' | 'danger'> = {
  collectedToday: 'brand',
  customersPaidToday: 'info',
  newDebtsToday: 'warning',
  outstandingDebt: 'danger',
  owedToSuppliers: 'warning',
  openServiceJobs: 'info',
  readyForPickup: 'brand',
  activeProducts: 'info',
};

const toneChip = {
  brand: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  info: 'bg-sky-50 text-sky-700 ring-sky-100',
  warning: 'bg-amber-50 text-amber-700 ring-amber-100',
  danger: 'bg-red-50 text-red-700 ring-red-100',
} as const;

export function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  const Icon = dashboardKpiIcons[kpi.key];
  const tone = kpiTone[kpi.key];
  const value = kpi.valueKind === 'money' ? formatMoney(String(kpi.value)) : String(kpi.value);
  const delta = sparklineDeltaPercent(kpi.sparkline);
  return (
    <Link
      to={kpi.route}
      className="group relative flex flex-col justify-between overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1 ${toneChip[tone]}`}
          aria-hidden="true"
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {Number.isFinite(delta) && <DeltaChip percent={delta} goodDirection={kpi.goodDirection} />}
      </div>
      <div className="mt-3 min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <BilingualLabel label={dashboardLabels[kpi.key]} compact />
        </p>
        <p className="mt-1 truncate text-2xl font-bold text-slate-950" title={value}>
          {value}
        </p>
      </div>
      {kpi.sparkline.length >= 3 && (
        <div className="pointer-events-none mt-2 -mx-1 opacity-70 transition-opacity group-hover:opacity-100">
          <KpiSparkline data={kpi.sparkline} />
        </div>
      )}
    </Link>
  );
}
