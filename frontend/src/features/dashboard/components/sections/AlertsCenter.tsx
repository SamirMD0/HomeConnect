import { AlertTriangle, CircleAlert, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import { dashboardLabels } from '../../config/dashboard-labels';
import type { DashboardAlert, DashboardAlertsData } from '../../types';
import { DashboardSection } from '../layout/DashboardSection';
import { SectionState } from './SectionState';

const severity = {
  warning: { icon: AlertTriangle, label: 'Warning', chip: 'bg-amber-500/15 text-amber-700', panel: 'border-amber-200 bg-amber-50/60' },
  serious: { icon: CircleAlert, label: 'Serious', chip: 'bg-orange-500/15 text-orange-700', panel: 'border-orange-200 bg-orange-50/60' },
  critical: { icon: ShieldAlert, label: 'Critical', chip: 'bg-red-500/15 text-red-700', panel: 'border-red-200 bg-red-50/60' },
};

export function AlertsCenter({ data, isLoading, isError, onRetry }: { data?: DashboardAlertsData; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  return (
    <DashboardSection title={dashboardLabels.alerts} icon={ShieldAlert}>
      <SectionState isLoading={isLoading} isError={isError} onRetry={onRetry} emptyText="No alerts — everything is current / لا توجد تنبيهات">
        {data?.alerts.length ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {data.alerts.map((alert) => <AlertCard key={alert.key} alert={alert} />)}
          </div>
        ) : (
          <div className="flex min-h-28 items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-800">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            <span>No alerts — everything is current / لا توجد تنبيهات</span>
          </div>
        )}
      </SectionState>
    </DashboardSection>
  );
}

function AlertCard({ alert }: { alert: DashboardAlert }) {
  const config = severity[alert.severity];
  const Icon = config.icon;
  return (
    <article className={`rounded-xl border p-4 ${config.panel}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${config.chip}`} aria-hidden="true">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${config.chip}`}>{config.label}</span>
            <h3 className="mt-1 text-sm font-semibold text-slate-900">
              <span>{alert.label.en}</span> <span dir="rtl" className="font-normal text-slate-600">/ {alert.label.ar}</span>
            </h3>
          </div>
        </div>
        <strong className="text-xl font-bold tabular-nums text-slate-900">{alert.count}</strong>
      </div>
      {alert.amount && <p className="mt-3 text-sm font-semibold tabular-nums text-slate-900">{formatMoney(alert.amount)} at risk</p>}
      {alert.offenders.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {alert.offenders.map((row) => (
            <Link key={row.id} to={row.route} className="flex justify-between gap-2 border-t border-slate-900/10 pt-1.5 text-xs text-slate-700 hover:underline">
              <span className="user-text truncate" dir="auto">{row.label}</span>
              {row.amount && <strong className="tabular-nums">{formatMoney(row.amount)}</strong>}
            </Link>
          ))}
        </div>
      )}
      <Link to={alert.route} className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:underline">View all</Link>
    </article>
  );
}
