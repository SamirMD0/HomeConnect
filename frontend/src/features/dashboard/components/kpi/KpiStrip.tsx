import type { DashboardKpi } from '../../types';
import { KpiCard } from './KpiCard';
export function KpiStrip({ kpis, isLoading, isError, onRetry }: { kpis?: DashboardKpi[]; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  if (isLoading) return <div className="dashboard-kpi-grid">{Array.from({ length: 8 }, (_, index) => <div key={index} className="dashboard-kpi-card h-[154px] animate-pulse bg-slate-100" />)}</div>;
  if (isError || !kpis) return <div className="dashboard-state"><p>Unable to load headline metrics / تعذر تحميل المؤشرات</p><button onClick={onRetry}>Retry</button></div>;
  return <div className="dashboard-kpi-grid">{kpis.slice(0, 8).map((kpi) => <KpiCard key={kpi.key} kpi={kpi} />)}</div>;
}
