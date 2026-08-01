import { AlertTriangle, CircleAlert, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import { dashboardLabels } from '../../config/dashboard-labels';
import type { DashboardAlert, DashboardAlertsData } from '../../types';
import { DashboardSection } from '../layout/DashboardSection';
import { SectionState } from './SectionState';

const severity = {
  warning: { icon: AlertTriangle, label: 'Warning', className: 'border-[#fab219] bg-amber-50 text-amber-900' },
  serious: { icon: CircleAlert, label: 'Serious', className: 'border-[#ec835a] bg-orange-50 text-orange-950' },
  critical: { icon: ShieldAlert, label: 'Critical', className: 'border-[#d03b3b] bg-red-50 text-red-950' },
};

export function AlertsCenter({ data, isLoading, isError, onRetry }: { data?: DashboardAlertsData; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  return <DashboardSection title={dashboardLabels.alerts} icon={ShieldAlert}><SectionState isLoading={isLoading} isError={isError} onRetry={onRetry} emptyText="No alerts — everything is current / لا توجد تنبيهات"><>{data?.alerts.length ? <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{data.alerts.map((alert) => <AlertCard key={alert.key} alert={alert} />)}</div> : <div className="flex min-h-28 items-center justify-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-800"><ShieldCheck className="h-5 w-5" /><span>No alerts — everything is current / لا توجد تنبيهات</span></div>}</></SectionState></DashboardSection>;
}

function AlertCard({ alert }: { alert: DashboardAlert }) {
  const config = severity[alert.severity]; const Icon = config.icon;
  return <article className={`rounded-lg border-l-4 p-3 ${config.className}`}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div><span className="text-[10px] font-bold uppercase">{config.label}</span><h3 className="text-sm font-semibold"><span>{alert.label.en}</span> <span dir="rtl" className="font-normal">/ {alert.label.ar}</span></h3></div></div><strong className="text-lg">{alert.count}</strong></div>{alert.amount && <p className="mt-2 text-sm font-bold">{formatMoney(alert.amount)} at risk</p>}{alert.offenders.length > 0 && <div className="mt-2 space-y-1">{alert.offenders.map((row) => <Link key={row.id} to={row.route} className="flex justify-between gap-2 border-t border-black/5 pt-1.5 text-xs hover:underline"><span className="user-text truncate" dir="auto">{row.label}</span>{row.amount && <strong>{formatMoney(row.amount)}</strong>}</Link>)}</div>}<Link to={alert.route} className="mt-3 inline-block text-xs font-semibold underline">View all</Link></article>;
}

