import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CircleAlert, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../../hooks/useAuth';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import { dashboardLabels } from '../../config/dashboard-labels';
import { dashboardKpiIcons } from '../../config/module-registry';
import type { DashboardAlert, DashboardAlertsData, DashboardKpi } from '../../types';
import { BilingualLabel } from './BilingualLabel';

const GREETINGS: Array<{ from: number; en: string; ar: string }> = [
  { from: 0, en: 'Good night', ar: 'مساء الخير' },
  { from: 5, en: 'Good morning', ar: 'صباح الخير' },
  { from: 12, en: 'Good afternoon', ar: 'مساء النور' },
  { from: 17, en: 'Good evening', ar: 'مساء الخير' },
  { from: 21, en: 'Good night', ar: 'تصبح على خير' },
];

function greetingFor(hour: number): { en: string; ar: string } {
  return [...GREETINGS].reverse().find((g) => hour >= g.from) ?? GREETINGS[1];
}

function firstName(fullName: string | undefined): string {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0] ?? '';
}

/** The KPIs that describe today alone. They live here; KpiStrip shows the rest. */
export const TODAY_KPI_KEYS: ReadonlyArray<DashboardKpi['key']> = [
  'collectedToday',
  'customersPaidToday',
  'newDebtsToday',
];

/** Money in is green, people paying is informational, new debt needs watching. */
const todayTone: Partial<Record<DashboardKpi['key'], string>> = {
  collectedToday: 'bg-emerald-500/15 text-emerald-700',
  customersPaidToday: 'bg-sky-500/15 text-sky-700',
  newDebtsToday: 'bg-amber-500/15 text-amber-700',
};

const severityStyle: Record<DashboardAlert['severity'], { icon: typeof AlertTriangle; chip: string }> = {
  warning: { icon: AlertTriangle, chip: 'bg-amber-500/15 text-amber-700' },
  serious: { icon: CircleAlert, chip: 'bg-orange-500/15 text-orange-700' },
  critical: { icon: ShieldAlert, chip: 'bg-red-500/15 text-red-700' },
};

export interface TodayRailProps {
  /** Business date returned by the overview response, ISO YYYY-MM-DD. */
  businessDate?: string;
  kpis?: DashboardKpi[];
  isLoading: boolean;
  alerts?: DashboardAlertsData;
  /** In-page id of the full alerts chapter. */
  alertsAnchorId: string;
}

/**
 * The page's left column: who is signed in, what today has brought so far, and
 * what needs a person next. Everything an owner checks first on opening the app,
 * read top to bottom without scrolling past charts.
 */
export function TodayRail({ businessDate, kpis, isLoading, alerts, alertsAnchorId }: TodayRailProps) {
  const { user } = useAuth();
  const greeting = greetingFor(new Date().getHours());
  const name = firstName(user?.fullName);
  const displayDate = businessDate
    ? new Date(`${businessDate}T00:00:00`).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const today = TODAY_KPI_KEYS.map((key) => kpis?.find((kpi) => kpi.key === key)).filter(
    (kpi): kpi is DashboardKpi => Boolean(kpi)
  );
  const attention = alerts?.alerts ?? [];

  return (
    <aside className="dashboard-panel flex min-w-0 flex-col gap-6 p-5 lg:p-8">
      <header className="border-b border-brand-200/70 pb-6">
        <p className="text-sm font-medium text-slate-600">{displayDate ?? 'Today'}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          {name ? `${greeting.en}, ${name}` : greeting.en}
        </h1>
        <p dir="rtl" className="user-text mt-0.5 text-sm text-slate-600">
          {name ? `${greeting.ar}، ${name}` : greeting.ar}
        </p>
      </header>

      <section aria-label="Today so far" className="border-b border-brand-200/70 pb-6">
        <h2 className="text-sm font-medium text-slate-600">Today so far</h2>
        <ul className="mt-4 space-y-4">
          {isLoading
            ? TODAY_KPI_KEYS.map((key) => (
                <li key={key} className="h-11 animate-pulse rounded-lg bg-brand-100/70" />
              ))
            : today.map((kpi) => <TodayMetric key={kpi.key} kpi={kpi} />)}
        </ul>
      </section>

      <section aria-label="Needs attention" className="flex min-h-0 flex-col">
        <h2 className="text-sm font-medium text-slate-600">
          {attention.length > 0 ? 'Needs attention' : 'Nothing needs attention'}
        </h2>
        {attention.length > 0 ? (
          <>
            <ul className="mt-4 space-y-2">
              {attention.slice(0, 5).map((alert) => (
                <AttentionRow key={alert.key} alert={alert} />
              ))}
            </ul>
            <a
              href={`#${alertsAnchorId}`}
              className="mt-4 inline-flex items-center gap-1.5 self-end text-sm font-semibold text-brand-700 hover:underline"
            >
              All alerts
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </>
        ) : (
          <p className="mt-4 flex items-center gap-3 rounded-xl bg-white p-3 text-sm font-medium text-slate-700">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700">
              <ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            Everything is current.
          </p>
        )}
      </section>
    </aside>
  );
}

function TodayMetric({ kpi }: { kpi: DashboardKpi }) {
  const Icon = dashboardKpiIcons[kpi.key];
  const value = kpi.valueKind === 'money' ? formatMoney(String(kpi.value)) : String(kpi.value);
  return (
    <li>
      <Link
        to={kpi.route}
        className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${todayTone[kpi.key] ?? 'bg-brand-500/15 text-brand-700'}`}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xl font-bold leading-tight tabular-nums text-slate-900 group-hover:text-brand-700" title={value}>
            {value}
          </span>
          <span className="block truncate text-xs text-slate-600">
            <BilingualLabel label={dashboardLabels[kpi.key]} compact />
          </span>
        </span>
      </Link>
    </li>
  );
}

function AttentionRow({ alert }: { alert: DashboardAlert }) {
  const { icon: Icon, chip } = severityStyle[alert.severity];
  return (
    <li>
      <Link
        to={alert.route}
        className="flex items-center gap-3 rounded-xl bg-white p-3 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${chip}`} aria-hidden="true">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{alert.label.en}</span>
          {alert.amount && (
            <span className="block truncate text-xs tabular-nums text-slate-600">{formatMoney(alert.amount)}</span>
          )}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${chip}`}>{alert.count}</span>
      </Link>
    </li>
  );
}
