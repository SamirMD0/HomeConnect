import { ReceivableTier } from '../types/receivables.types';

export interface ReceivableTierStyle {
  /** Short label used inside the standing chip. */
  label: string;
  /** Longer label used in the filter chips. */
  filterLabel: string;
  chipClass: string;
  dotClass: string;
  /** Left accent on the parent row; empty for calm tiers. */
  rowAccentClass: string;
}

/** Ordered best to worst — drives the filter chip order. */
export const receivableTierOrder: ReceivableTier[] = [
  'CRITICAL',
  'SEVERE',
  'LATE',
  'WATCH',
  'CURRENT',
  'NO_ACTIVITY',
];

export const receivableTierStyles: Record<ReceivableTier, ReceivableTierStyle> = {
  CURRENT: {
    label: 'Current',
    filterLabel: 'Current',
    chipClass: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dotClass: 'bg-emerald-500',
    rowAccentClass: '',
  },
  WATCH: {
    label: 'Watch',
    filterLabel: 'Watch · 1-30d',
    chipClass: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    dotClass: 'bg-amber-500',
    rowAccentClass: 'border-l-2 border-l-amber-300',
  },
  LATE: {
    label: 'Late',
    filterLabel: 'Late · 31-60d',
    chipClass: 'bg-orange-50 text-orange-800 ring-orange-600/20',
    dotClass: 'bg-orange-500',
    rowAccentClass: 'border-l-2 border-l-orange-400',
  },
  SEVERE: {
    label: 'Severe',
    filterLabel: 'Severe · 61-90d',
    chipClass: 'bg-red-50 text-red-700 ring-red-600/20',
    dotClass: 'bg-red-600',
    rowAccentClass: 'border-l-2 border-l-red-500',
  },
  CRITICAL: {
    label: 'Critical',
    filterLabel: 'Critical · 90d+',
    chipClass: 'bg-red-900/10 text-red-900 ring-red-900/30',
    dotClass: 'bg-red-900',
    rowAccentClass: 'border-l-4 border-l-red-900',
  },
  NO_ACTIVITY: {
    label: 'No activity',
    filterLabel: 'No activity',
    chipClass: 'bg-slate-100 text-slate-600 ring-slate-600/10',
    dotClass: 'bg-slate-400',
    rowAccentClass: '',
  },
};

export function getReceivableTierStyle(tier: ReceivableTier): ReceivableTierStyle {
  return receivableTierStyles[tier] ?? receivableTierStyles.NO_ACTIVITY;
}

export function formatDaysAgo(days: number | null): string {
  if (days === null) return '';
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}
