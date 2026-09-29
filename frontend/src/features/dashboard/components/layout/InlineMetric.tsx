import type { ReactNode } from 'react';
import { cn } from '../../../../lib/cn';

export interface InlineMetricProps {
  label: ReactNode;
  value: ReactNode;
  /** Semantic tone for the accent stripe. Defaults to brand emerald. */
  tone?: 'brand' | 'neutral' | 'warning' | 'danger' | 'info';
  className?: string;
}

/**
 * Shared mini-metric used inside analytics section cards. Replaces the ad-hoc
 * `border-l-2 border-blue-500` treatment that varied per section, so every
 * analytic block on the page now speaks the same visual language.
 */
export function InlineMetric({ label, value, tone = 'brand', className }: InlineMetricProps) {
  const stripe = {
    brand: 'before:bg-emerald-500',
    neutral: 'before:bg-slate-400',
    warning: 'before:bg-amber-500',
    danger: 'before:bg-red-500',
    info: 'before:bg-sky-500',
  }[tone];
  return (
    <div
      className={cn(
        'relative min-w-0 rounded-md bg-slate-50/60 px-3 py-2',
        'before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full',
        stripe,
        className
      )}
    >
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}
