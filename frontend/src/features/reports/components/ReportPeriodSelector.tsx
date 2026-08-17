import { CalendarRange, RefreshCw } from 'lucide-react';
import type { MonthlyReviewQuery, ReportsPeriodPreset } from '../types/monthly-review.types';

const presets: Array<{ value: Exclude<ReportsPeriodPreset, 'custom' | 'thisWeek' | 'today'>; label: string }> = [
  { value: 'thisMonth', label: 'This month / هذا الشهر' },
  { value: 'lastMonth', label: 'Last month / الشهر الماضي' },
];

export function ReportPeriodSelector({
  value,
  onChange,
  onRefresh,
  isRefreshing,
  generatedAt,
}: {
  value: MonthlyReviewQuery;
  onChange: (value: MonthlyReviewQuery) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  generatedAt?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <CalendarRange className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            aria-pressed={value.period === preset.value}
            onClick={() => onChange({ period: preset.value })}
            className={periodButton(value.period === preset.value)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={value.period === 'custom'}
          onClick={() => onChange({ period: 'custom', from: value.from, to: value.to })}
          className={periodButton(value.period === 'custom')}
        >
          Custom / مخصص
        </button>
        {value.period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Report from date"
              type="date"
              value={value.from ?? ''}
              onChange={(event) => onChange({ ...value, from: event.target.value })}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
            <span className="text-xs text-slate-500">to / إلى</span>
            <input
              aria-label="Report to date"
              type="date"
              value={value.to ?? ''}
              onChange={(event) => onChange({ ...value, to: event.target.value })}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {generatedAt && (
          <span className="text-[11px] text-slate-400">
            Updated {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          aria-label="Refresh monthly review"
          title="Refresh monthly review"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}

function periodButton(active: boolean) {
  return `rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
    active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
  }`;
}
