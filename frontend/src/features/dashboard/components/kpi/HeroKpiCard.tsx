import { Link } from 'react-router-dom';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import { dashboardLabels } from '../../config/dashboard-labels';
import type { DashboardKpi } from '../../types';
import { BilingualLabel } from '../layout/BilingualLabel';
import { KpiSparkline } from './KpiSparkline';
import { DeltaChip, sparklineDeltaPercent } from './DeltaChip';

/**
 * Large panel for a running balance: label, value, change, and the trend beside
 * it. A panel of the KPI area's mosaic, so it has no card chrome of its own.
 */
export function HeroKpiCard({ kpi }: { kpi: DashboardKpi }) {
  const value = kpi.valueKind === 'money' ? formatMoney(String(kpi.value)) : String(kpi.value);
  const delta = sparklineDeltaPercent(kpi.sparkline);
  return (
    <Link
      to={kpi.route}
      className="group block min-w-0 p-6 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 lg:p-8"
    >
      <h3 className="truncate text-lg font-bold tracking-tight text-slate-900">
        <BilingualLabel label={dashboardLabels[kpi.key]} compact />
      </h3>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[1.75rem] font-bold leading-tight tabular-nums text-slate-900" title={value}>
            {value}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {Number.isFinite(delta) ? (
              <DeltaChip percent={delta} goodDirection={kpi.goodDirection} />
            ) : (
              <span className="text-xs font-medium text-slate-500">No comparison yet</span>
            )}
            <span className="whitespace-nowrap text-xs text-slate-500">vs previous period</span>
          </div>
        </div>
        {kpi.sparkline.length >= 3 && (
          <div className="hidden shrink-0 2xl:block">
            <KpiSparkline data={kpi.sparkline} width={144} height={56} />
          </div>
        )}
      </div>
    </Link>
  );
}
