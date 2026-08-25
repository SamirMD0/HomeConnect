import React from 'react';
import { AlertTriangle, PackageCheck, PackageX, Layers } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useInventorySummary } from '../../inventory/hooks/useInventory';
import { ProductFilters as ProductFilterValues, ProductStockFilter } from '../types/product.types';
import { productLabels } from '../utils/product-labels';

interface ProductStatsProps {
  /** Rows matching the filters currently applied, across all pages. */
  totalMatching?: number;
  filters: ProductFilterValues;
  onFilter: (patch: Partial<ProductFilterValues>) => void;
}

/**
 * Clicking a tile that is already applied clears it, so the tiles behave like
 * the toggles they look like rather than a one-way trip into a filtered view
 * the operator then has to work out how to leave.
 */
export const productStockStatPatch = (
  current: ProductFilterValues,
  status: ProductStockFilter
): Partial<ProductFilterValues> => ({
  stockStatus: current.stockStatus === status ? undefined : status,
  trackStock: undefined,
  page: 1,
});

export const productTrackedStatPatch = (current: ProductFilterValues): Partial<ProductFilterValues> => ({
  trackStock: current.trackStock === true ? undefined : true,
  stockStatus: undefined,
  page: 1,
});

/**
 * The three stock figures come from the inventory summary, which counts the
 * whole catalogue with the same SQL predicates the stock filter uses — so a
 * tile's number and the list it opens always agree. "Showing" is the only
 * filter-scoped figure, and is labelled as such rather than sitting unmarked
 * next to three that are not.
 */
export const ProductStats: React.FC<ProductStatsProps> = ({ totalMatching, filters, onFilter }) => {
  const summary = useInventorySummary();
  const loading = summary.isLoading;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label={productLabels.showingProducts}
        value={totalMatching}
        loading={totalMatching === undefined}
        icon={<Layers />}
        tone="neutral"
      />
      <Tile
        label={productLabels.trackedProducts}
        value={summary.data?.trackedProducts}
        loading={loading}
        icon={<PackageCheck />}
        tone="brand"
        active={filters.trackStock === true}
        onClick={() => onFilter(productTrackedStatPatch(filters))}
      />
      <Tile
        label={productLabels.lowStockProducts}
        value={summary.data?.lowStockProducts}
        loading={loading}
        icon={<AlertTriangle />}
        tone="amber"
        active={filters.stockStatus === 'LOW_STOCK'}
        onClick={() => onFilter(productStockStatPatch(filters, 'LOW_STOCK'))}
      />
      <Tile
        label={productLabels.outOfStockProducts}
        value={summary.data?.outOfStockProducts}
        loading={loading}
        icon={<PackageX />}
        tone="red"
        active={filters.stockStatus === 'OUT_OF_STOCK'}
        onClick={() => onFilter(productStockStatPatch(filters, 'OUT_OF_STOCK'))}
      />
    </div>
  );
};

type Tone = 'neutral' | 'brand' | 'amber' | 'red';

const ICON_TONES: Record<Tone, string> = {
  neutral: 'text-slate-400',
  brand: 'text-brand-600',
  amber: 'text-amber-500',
  red: 'text-red-500',
};

const ACTIVE_TONES: Record<Tone, string> = {
  neutral: 'border-slate-300',
  brand: 'border-brand-500 ring-1 ring-brand-500/30',
  amber: 'border-amber-400 ring-1 ring-amber-400/30',
  red: 'border-red-400 ring-1 ring-red-400/30',
};

const Tile: React.FC<{
  label: string;
  value?: number;
  loading: boolean;
  icon: React.ReactNode;
  tone: Tone;
  active?: boolean;
  onClick?: () => void;
}> = ({ label, value, loading, icon, tone, active = false, onClick }) => {
  const body = (
    <>
      <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <span className={cn('inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4', ICON_TONES[tone])} aria-hidden="true">{icon}</span>
        <span className="min-w-0 truncate">{label}</span>
      </span>
      {loading || value === undefined
        ? <Skeleton className="mt-2 h-7 w-14" />
        : <span className="mt-1 block text-2xl font-bold tabular-nums text-slate-900">{value}</span>}
    </>
  );

  const shell = 'rounded-xl border bg-white p-4 text-left shadow-sm';

  if (!onClick) return <div className={cn(shell, 'border-slate-200')}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        shell,
        'transition-colors hover:border-slate-300 hover:bg-slate-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
        active ? ACTIVE_TONES[tone] : 'border-slate-200'
      )}
    >
      {body}
    </button>
  );
};
