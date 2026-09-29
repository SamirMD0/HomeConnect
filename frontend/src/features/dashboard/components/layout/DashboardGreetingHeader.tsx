import { Link } from 'react-router-dom';
import { Plus, HandCoins, ScanLine } from 'lucide-react';
import { useAuth } from '../../../../hooks/useAuth';
import { BilingualLabel } from './BilingualLabel';
import type { DashboardAlertsData } from '../../types';

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

export interface DashboardGreetingHeaderProps {
  /** Business date returned by the overview response, ISO YYYY-MM-DD. */
  businessDate?: string;
  /** Alerts payload — used to summarise pending items in one sentence. */
  alerts?: DashboardAlertsData;
}

/**
 * Personalized hero above the KPI area. Dreams-ERP-inspired shape — greeting,
 * one-line pending summary, primary CTAs pinned right — adapted for a
 * shop-floor tool (no emoji, no marketing tone, no dark surface). Falls back
 * to just "Dashboard" when auth or data isn't ready yet so the layout doesn't
 * jump.
 */
export function DashboardGreetingHeader({ businessDate, alerts }: DashboardGreetingHeaderProps) {
  const { user } = useAuth();
  const now = new Date();
  const greeting = greetingFor(now.getHours());
  const name = firstName(user?.fullName);
  const heading = name ? `${greeting.en}, ${name}` : greeting.en;
  const arabicHeading = name ? `${greeting.ar}، ${name}` : greeting.ar;

  const summaries = summarisePending(alerts);
  const displayDate = businessDate
    ? new Date(`${businessDate}T00:00:00`).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : null;

  return (
    <header className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          {displayDate ?? 'Today'}
        </p>
        <h1 className="mt-1 truncate text-2xl font-bold text-slate-900 sm:text-3xl">{heading}</h1>
        <p dir="rtl" className="user-text mt-0.5 truncate text-sm text-slate-500">
          {arabicHeading}
        </p>
        {summaries.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            {summaries.map((entry, index) => (
              <span key={entry.key} className="flex items-center gap-1.5">
                {index > 0 && <span className="text-slate-300">·</span>}
                <span className={`inline-block h-2 w-2 rounded-full ${entry.dot}`} aria-hidden="true" />
                <span>
                  <strong className="font-semibold text-slate-900">{entry.count}</strong> {entry.label}
                </span>
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Link
          to="/scanner"
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
        >
          <ScanLine className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <BilingualLabel label={{ en: 'Scan', ar: 'مسح' }} compact />
        </Link>
        <Link
          to="/receivables"
          className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
        >
          <HandCoins className="h-4 w-4" aria-hidden="true" />
          <BilingualLabel label={{ en: 'Record payment', ar: 'تسجيل دفعة' }} compact />
        </Link>
        <Link
          to="/sales-orders?new=1"
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <BilingualLabel label={{ en: 'New sale', ar: 'بيع جديد' }} compact />
        </Link>
      </div>
    </header>
  );
}
interface Summary {
  key: string;
  count: number;
  label: string;
  dot: string;
}

function summarisePending(alerts?: DashboardAlertsData): Summary[] {
  if (!alerts?.alerts?.length) return [];
  const out: Summary[] = [];
  for (const alert of alerts.alerts) {
    if (out.length >= 3) break;
    const dot =
      alert.severity === 'critical' ? 'bg-red-500' : alert.severity === 'serious' ? 'bg-orange-500' : 'bg-amber-500';
    out.push({ key: alert.key, count: alert.count, label: alert.label.en.toLowerCase(), dot });
  }
  return out;
}
