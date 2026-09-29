import { ArrowDown, ArrowUp, X } from 'lucide-react';
import type { PricingCardSpecCatalogItem } from '../types/pricing-card.types';

interface SpecKeySelectorProps {
  catalog: readonly PricingCardSpecCatalogItem[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export function SpecKeySelector({ catalog, value, onChange, disabled = false }: SpecKeySelectorProps) {
  const catalogByKey = new Map(catalog.map((item) => [item.key, item]));
  const groups = groupCatalog(catalog);

  return (
    <div className="space-y-4">
      <div className="space-y-3" aria-label="Available specification keys">
        {groups.map(({ group, items }) => (
          <fieldset key={group} className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((item) => {
                const selected = value.includes(item.key);
                return (
                  <label key={item.key} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={(event) => onChange(toggleSpecKey(value, item.key, event.target.checked))}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-medium">{item.label}</span>
                      <span className="font-mono text-xs text-slate-500">{item.key}{item.unit ? ` · ${item.unit}` : ''}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        {groups.length === 0 && <p className="text-sm text-slate-500">No specification keys are available.</p>}
      </div>

      <div className="space-y-2" aria-label="Selected specification key order">
        <h3 className="text-sm font-medium text-slate-700">Selected order</h3>
        {value.length === 0 && <p className="text-sm text-slate-500">No specification keys selected.</p>}
        {value.map((key, index) => {
          const item = catalogByKey.get(key);
          const label = item?.label ?? key;
          return (
            <div key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="w-6 text-xs tabular-nums text-slate-500">{index + 1}.</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{label}</span>
                <span className="block truncate font-mono text-xs text-slate-500">{key}</span>
              </span>
              {!item && <span className="text-xs text-amber-700">Not in catalog</span>}
              <OrderButton label={`Move ${label} up`} disabled={disabled || index === 0} onClick={() => onChange(moveSpecKey(value, index, index - 1))}>
                <ArrowUp className="h-4 w-4" />
              </OrderButton>
              <OrderButton label={`Move ${label} down`} disabled={disabled || index === value.length - 1} onClick={() => onChange(moveSpecKey(value, index, index + 1))}>
                <ArrowDown className="h-4 w-4" />
              </OrderButton>
              <OrderButton label={`Remove ${label}`} disabled={disabled} onClick={() => onChange(toggleSpecKey(value, key, false))}>
                <X className="h-4 w-4" />
              </OrderButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function toggleSpecKey(value: readonly string[], key: string, selected: boolean): string[] {
  if (selected) return value.includes(key) ? [...value] : [...value, key];
  return value.filter((candidate) => candidate !== key);
}

export function moveSpecKey(value: readonly string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex < 0 || fromIndex >= value.length || toIndex < 0 || toIndex >= value.length || fromIndex === toIndex) {
    return [...value];
  }
  const next = [...value];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function groupCatalog(catalog: readonly PricingCardSpecCatalogItem[]) {
  const groups = new Map<string, PricingCardSpecCatalogItem[]>();
  for (const item of catalog) {
    const entries = groups.get(item.group) ?? [];
    entries.push(item);
    groups.set(item.group, entries);
  }
  return [...groups].map(([group, items]) => ({ group, items }));
}

function OrderButton({ label, disabled, onClick, children }: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
