import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '../../../../lib/cn';

export interface DeltaChipProps {
  /** Delta as a signed number: +12 means +12%, -3.5 means -3.5%. */
  percent: number;
  /** 'up' when a higher value is good (collections). 'down' when lower is good (outstanding debt). */
  goodDirection: 'up' | 'down' | 'neutral';
  className?: string;
}

/**
 * Small ▲/▼ delta pill. The colour follows whether the move is favourable for
 * the metric (see `goodDirection`) — a rising outstanding debt is bad, a
 * rising collection is good — and the leading arrow glyph guarantees the
 * direction is legible without relying on colour alone.
 */
export function DeltaChip({ percent, goodDirection, className }: DeltaChipProps) {
  if (!Number.isFinite(percent)) return null;
  const rounded = Math.abs(percent) < 0.05 ? 0 : Math.round(percent * 10) / 10;
  if (rounded === 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500',
          className
        )}
        aria-label="No change"
      >
        <Minus className="h-3 w-3" aria-hidden="true" />
        0%
      </span>
    );
  }
  const rising = rounded > 0;
  const favourable = goodDirection === 'neutral' ? true : rising === (goodDirection === 'up');
  const tone = favourable
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-red-50 text-red-700';
  const Arrow = rising ? ArrowUpRight : ArrowDownRight;
  const magnitude = Math.abs(rounded);
  const display = magnitude >= 1000 ? '999+%' : `${magnitude}%`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
        tone,
        className
      )}
      aria-label={`${rising ? 'Up' : 'Down'} ${magnitude} percent versus previous period`}
    >
      <Arrow className="h-3 w-3" aria-hidden="true" />
      {display}
    </span>
  );
}

/**
 * Derives a percent change from a sparkline of {value} points.
 * Compares the last bucket to the second-to-last. Returns NaN when either
 * value is not numeric or when the baseline is zero.
 */
export function sparklineDeltaPercent(points: ReadonlyArray<{ value: string | number }>): number {
  if (points.length < 2) return NaN;
  const previous = Number(points[points.length - 2]?.value ?? NaN);
  const latest = Number(points[points.length - 1]?.value ?? NaN);
  if (!Number.isFinite(previous) || !Number.isFinite(latest) || previous === 0) return NaN;
  return ((latest - previous) / Math.abs(previous)) * 100;
}
