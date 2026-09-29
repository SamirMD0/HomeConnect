import type { DashboardKpi } from '../../types';
import { HeroKpiCard } from './HeroKpiCard';
import { KpiCard } from './KpiCard';

/**
 * KPI area: one hero card (the primary metric) followed by up to 7 compact
 * supporting cards. Uses `collectedToday` as the hero when present because
 * money-in is the most-scanned metric on a shop-floor day; falls back to the
 * first KPI otherwise so a backend change to the KPI set can't break the
 * page.
 */
export function KpiStrip({
  kpis,
  isLoading,
  isError,
  onRetry,
}: {
  kpis?: DashboardKpi[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-3">
        <div className="h-[120px] animate-pulse rounded-lg border border-emerald-100 bg-emerald-50/40" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="h-[128px] animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }
  if (isError || !kpis || kpis.length === 0) {
    return (
      <div className="dashboard-state">
        <p>Unable to load headline metrics / تعذر تحميل المؤشرات</p>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  const hero = kpis.find((kpi) => kpi.key === 'collectedToday') ?? kpis[0];
  const supporting = kpis.filter((kpi) => kpi !== hero).slice(0, 7);
  return (
    <div className="grid gap-3">
      <HeroKpiCard kpi={hero} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {supporting.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} />
        ))}
      </div>
    </div>
  );
}
