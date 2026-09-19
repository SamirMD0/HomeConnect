import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useFeatureIcons } from '../../pricing-card/hooks/useFeatureIcons';
import type { PricingCardFeatureIcon } from '../../pricing-card/types/pricing-card.types';
import type { ProductFeatureHighlight } from '../types/product.types';

export const MAX_PRODUCT_FEATURES = 8;

interface Props {
  value: ProductFeatureHighlight[];
  onChange: (next: ProductFeatureHighlight[]) => void;
  disabled?: boolean;
}

export function ProductFeatureHighlightsEditor({ value, onChange, disabled = false }: Props) {
  const iconsQuery = useFeatureIcons(true);
  const iconsByCode = useMemo(() => new Map((iconsQuery.data ?? []).map((icon) => [icon.code, icon])), [iconsQuery.data]);
  const groups = useMemo(() => groupIconsByCategory(iconsQuery.data ?? []), [iconsQuery.data]);
  const usedCodes = useMemo(() => new Set(value.map((entry) => entry.iconCode)), [value]);
  const atLimit = value.length >= MAX_PRODUCT_FEATURES;

  const add = (icon: PricingCardFeatureIcon) => {
    if (atLimit) return;
    onChange(reposition([...value, { iconCode: icon.code, label: icon.label, value: null, position: value.length + 1 }]));
  };

  const patch = (index: number, patch: Partial<ProductFeatureHighlight>) => {
    onChange(reposition(value.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry)));
  };

  const remove = (index: number) => onChange(reposition(value.filter((_, entryIndex) => entryIndex !== index)));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(reposition(next));
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-2" aria-label="Selected feature highlights">
        {value.length === 0 && <li className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">No feature highlights yet. Pick up to {MAX_PRODUCT_FEATURES} icons from the catalog below.</li>}
        {value.map((entry, index) => {
          const icon = iconsByCode.get(entry.iconCode);
          return (
            <li key={`${entry.iconCode}-${index}`} className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm ${icon ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50'}`}>
              <span className="inline-flex h-8 w-8 items-center justify-center text-slate-700" aria-hidden dangerouslySetInnerHTML={{ __html: icon?.svg ?? '' }} />
              <span className="w-24 shrink-0">
                <span className="block font-mono text-[11px] text-slate-500">{entry.iconCode}</span>
                {!icon && <span className="block text-xs text-amber-800">Icon missing from catalog</span>}
              </span>
              <label className="flex flex-1 min-w-[10rem] flex-col gap-1">
                <span className="text-xs text-slate-500">Label</span>
                <input type="text" value={entry.label ?? ''} onChange={(event) => patch(index, { label: event.target.value })} placeholder={icon?.label} maxLength={100} disabled={disabled} className="rounded border border-slate-300 px-2 py-1" />
              </label>
              <label className="flex w-32 shrink-0 flex-col gap-1">
                <span className="text-xs text-slate-500">Value</span>
                <input type="text" value={entry.value ?? ''} onChange={(event) => patch(index, { value: event.target.value })} maxLength={120} disabled={disabled} className="rounded border border-slate-300 px-2 py-1" />
              </label>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(index, -1)} disabled={disabled || index === 0} className="rounded border border-slate-300 p-1 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => move(index, 1)} disabled={disabled || index === value.length - 1} className="rounded border border-slate-300 p-1 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => remove(index)} disabled={disabled} className="rounded border border-red-300 p-1 text-red-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Remove"><X className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          );
        })}
      </ol>

      {!disabled && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{atLimit ? `Maximum ${MAX_PRODUCT_FEATURES} features reached` : 'Add icon'}</p>
          {iconsQuery.isLoading && <p className="text-sm text-slate-500">Loading icon catalog…</p>}
          {iconsQuery.isError && <p role="alert" className="text-sm text-red-700">Unable to load feature icons.</p>}
          <div className="space-y-3">
            {groups.map(({ category, icons }) => (
              <div key={category}>
                <p className="pb-1 text-xs font-medium text-slate-600">{category}</p>
                <div className="flex flex-wrap gap-2">
                  {icons.map((icon) => (
                    <button
                      key={icon.id}
                      type="button"
                      onClick={() => add(icon)}
                      disabled={atLimit || usedCodes.has(icon.code)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                      title={icon.code}
                    >
                      <Plus className="h-3 w-3" />
                      <span className="inline-block h-4 w-4" aria-hidden dangerouslySetInnerHTML={{ __html: icon.svg }} />
                      {icon.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function reposition(entries: ProductFeatureHighlight[]): ProductFeatureHighlight[] {
  return entries.map((entry, index) => ({ ...entry, position: index + 1 }));
}

export function groupIconsByCategory(icons: PricingCardFeatureIcon[]): Array<{ category: string; icons: PricingCardFeatureIcon[] }> {
  const map = new Map<string, PricingCardFeatureIcon[]>();
  for (const icon of icons) {
    const key = icon.category ?? 'Other';
    const bucket = map.get(key) ?? [];
    bucket.push(icon);
    map.set(key, bucket);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({ category, icons: list.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)) }));
}

export function highlightsChanged(before: ProductFeatureHighlight[] | undefined, after: ProductFeatureHighlight[]): boolean {
  const normalize = (entries: ProductFeatureHighlight[] | undefined) => (entries ?? []).map(({ iconCode, label, value, position }) => ({ iconCode, label: label ?? null, value: value ?? null, position }));
  return JSON.stringify(normalize(before)) !== JSON.stringify(normalize(after));
}
