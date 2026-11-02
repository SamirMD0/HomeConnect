import type { DashboardKpi } from '../../types';
import { HeroKpiCard } from './HeroKpiCard';
import { KpiCard } from './KpiCard';

/** The balances that decide the week: what customers owe, and what is owed out. */
const HEADLINE_KEYS: ReadonlyArray<DashboardKpi['key']> = ['outstandingDebt', 'owedToSuppliers'];

/**
 * KPI area: the two running balances as large panels, then the remaining counts
 * in one divided row. `exclude` holds the KPIs already shown in the today rail.
 * Unknown keys fall through to the compact row, so a backend change to the KPI
 * set can't break the page.
 */
export function KpiStrip({
  kpis,
  exclude = [],
  isLoading,
  isError,
  onRetry,
}: {
  kpis?: DashboardKpi[];
  exclude?: ReadonlyArray<DashboardKpi['key']>;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <div className="grid divide-y divide-slate-200 bg-white">
        <div className="grid divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
          {HEADLINE_KEYS.map((key) => (
            <div key={key} className="p-6 lg:p-8">
              <div className="h-[106px] animate-pulse rounded-lg bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="h-[92px] animate-pulse bg-slate-50" />
      </div>
    );
  }
  if (isError || !kpis || kpis.length === 0) {
    return (
      <div className="bg-white p-6">
        <div className="dashboard-state">
          <p>Unable to load headline metrics / تعذر تحميل المؤشرات</p>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  const visible = kpis.filter((kpi) => !exclude.includes(kpi.key));
  const headline = visible.filter((kpi) => HEADLINE_KEYS.includes(kpi.key));
  const supporting = visible.filter((kpi) => !HEADLINE_KEYS.includes(kpi.key));
  return (
    <div className="divide-y divide-slate-200 bg-white">
      <div className="grid divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
        {headline.map((kpi) => (
          <HeroKpiCard key={kpi.key} kpi={kpi} />
        ))}
      </div>
      <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {supporting.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} />
        ))}
      </div>
    </div>
  );
}
