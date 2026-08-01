import { Link } from 'react-router-dom';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import { dashboardLabels } from '../../config/dashboard-labels';
import { dashboardKpiIcons } from '../../config/module-registry';
import type { DashboardKpi } from '../../types';
import { BilingualLabel } from '../layout/BilingualLabel';
import { KpiSparkline } from './KpiSparkline';

export function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  const Icon = dashboardKpiIcons[kpi.key];
  return <Link to={kpi.route} className="dashboard-kpi-card"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-600"><BilingualLabel label={dashboardLabels[kpi.key]} /></p><p className="mt-2 truncate text-2xl font-bold text-slate-950">{kpi.valueKind === 'money' ? formatMoney(String(kpi.value)) : kpi.value}</p></div><span className="rounded-md bg-emerald-50 p-2 text-emerald-700"><Icon className="h-5 w-5" aria-hidden="true" /></span></div><div className="mt-3 flex h-8 items-end justify-between"><span className="text-[11px] text-slate-400">Current position</span><KpiSparkline data={kpi.sparkline} /></div></Link>;
}
