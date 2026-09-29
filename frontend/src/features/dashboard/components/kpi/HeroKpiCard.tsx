import { Link } from 'react-router-dom';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import { dashboardLabels } from '../../config/dashboard-labels';
import { dashboardKpiIcons } from '../../config/module-registry';
import type { DashboardKpi } from '../../types';
import { BilingualLabel } from '../layout/BilingualLabel';
import { KpiSparkline } from './KpiSparkline';
import { DeltaChip, sparklineDeltaPercent } from './DeltaChip';

/**
 * Wide hero variant of KpiCard for the primary metric on the dashboard.
 * Same data source as KpiCard, laid out with more breathing room and a
 * larger value so the reader's eye lands on it first when the page loads.
 */
export function HeroKpiCard({ kpi }: { kpi: DashboardKpi }) {
  const Icon = dashboardKpiIcons[kpi.key];
  const value = kpi.valueKind === 'money' ? formatMoney(String(kpi.value)) : String(kpi.value);
  const delta = sparklineDeltaPercent(kpi.sparkline);
  return (
    <Link
      to={kpi.route}
      className="group relative flex flex-col justify-between overflow-hidden rounded-lg border border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-200"
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
              <BilingualLabel label={dashboardLabels[kpi.key]} compact />
            </p>
          </div>
          <p className="mt-3 truncate text-4xl font-black text-slate-950" title={value}>
            {value}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {Number.isFinite(delta) ? (
              <DeltaChip percent={delta} goodDirection={kpi.goodDirection} />
            ) : (
              <span className="text-[11px] font-medium text-slate-500">No comparison yet</span>
            )}
            <span className="text-[11px] text-slate-500">vs previous period</span>
          </div>
        </div>
        {kpi.sparkline.length >= 3 && (
          <div className="hidden w-40 shrink-0 md:block">
            <KpiSparkline data={kpi.sparkline} />
          </div>
        )}
      </div>
    </Link>
  );
}
