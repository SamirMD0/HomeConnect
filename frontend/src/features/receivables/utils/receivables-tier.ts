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
  rowClass: string;
  rowHoverClass: string;
  primaryTextClass: string;
  secondaryTextClass: string;
  mutedTextClass: string;
  amountTextClass: string;
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
    rowAccentClass: 'border-l-2 border-l-emerald-400',
    rowClass: 'bg-emerald-50',
    rowHoverClass: 'hover:bg-emerald-100/70',
    primaryTextClass: 'text-emerald-950',
    secondaryTextClass: 'text-emerald-800',
    mutedTextClass: 'text-emerald-700/75',
    amountTextClass: 'text-emerald-950',
  },
  WATCH: {
    label: 'Watch',
    filterLabel: 'Watch · 1-30d',
    chipClass: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    dotClass: 'bg-amber-500',
    rowAccentClass: 'border-l-2 border-l-amber-300',
    rowClass: 'bg-amber-50/70',
    rowHoverClass: 'hover:bg-amber-100/70',
    primaryTextClass: 'text-amber-950',
    secondaryTextClass: 'text-amber-900',
    mutedTextClass: 'text-amber-800/80',
    amountTextClass: 'text-amber-950',
  },
  LATE: {
    label: 'Late',
    filterLabel: 'Late · 31-60d',
    chipClass: 'bg-orange-50 text-orange-800 ring-orange-600/20',
    dotClass: 'bg-orange-500',
    rowAccentClass: 'border-l-2 border-l-orange-400',
    rowClass: 'bg-orange-50/75',
    rowHoverClass: 'hover:bg-orange-100/75',
    primaryTextClass: 'text-orange-950',
    secondaryTextClass: 'text-orange-900',
    mutedTextClass: 'text-orange-800/80',
    amountTextClass: 'text-orange-950',
  },
  SEVERE: {
    label: 'Severe',
    filterLabel: 'Severe · 61-90d',
    chipClass: 'bg-red-50 text-red-700 ring-red-600/20',
    dotClass: 'bg-red-600',
    rowAccentClass: 'border-l-2 border-l-red-500',
    rowClass: 'bg-red-50/80',
    rowHoverClass: 'hover:bg-red-100/80',
    primaryTextClass: 'text-red-950',
    secondaryTextClass: 'text-red-900',
    mutedTextClass: 'text-red-800/80',
    amountTextClass: 'text-red-950',
  },
  CRITICAL: {
    label: 'Critical',
    filterLabel: 'Critical · 90d+',
    chipClass: 'bg-red-900/10 text-red-900 ring-red-900/30',
    dotClass: 'bg-red-900',
    rowAccentClass: 'border-l-4 border-l-red-900',
    rowClass: 'bg-red-100',
    rowHoverClass: 'hover:bg-red-100/90',
    primaryTextClass: 'text-red-950',
    secondaryTextClass: 'text-red-900',
    mutedTextClass: 'text-red-800',
    amountTextClass: 'text-red-950',
  },
  NO_ACTIVITY: {
    label: 'No activity',
    filterLabel: 'No activity',
    chipClass: 'bg-violet-50 text-violet-800 ring-violet-600/20',
    dotClass: 'bg-violet-500',
    rowAccentClass: 'border-l-2 border-l-violet-400',
    rowClass: 'bg-violet-50',
    rowHoverClass: 'hover:bg-violet-100/70',
    primaryTextClass: 'text-violet-950',
    secondaryTextClass: 'text-violet-800',
    mutedTextClass: 'text-violet-700/75',
    amountTextClass: 'text-violet-950',
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
