import type { ReactNode } from 'react';
import { cn } from '../../../../lib/cn';

export interface InlineMetricProps {
  label: ReactNode;
  value: ReactNode;
  /** Semantic tone of the leading dot. Defaults to brand. */
  tone?: 'brand' | 'neutral' | 'warning' | 'danger' | 'info';
  className?: string;
}

/**
 * Shared mini-metric used inside analytics section cards, so every analytic
 * block on the page speaks the same visual language. The dot says what kind of
 * number this is; the value stays in ink so it reads first.
 */
export function InlineMetric({ label, value, tone = 'brand', className }: InlineMetricProps) {
  const dot = {
    brand: 'bg-brand-500',
    neutral: 'bg-slate-400',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    info: 'bg-sky-500',
  }[tone];
  return (
    <div className={cn('min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-3', className)}>
      <p className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1.5 truncate text-lg font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
