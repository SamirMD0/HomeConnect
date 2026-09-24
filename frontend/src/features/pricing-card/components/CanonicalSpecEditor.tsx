import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ProductSpecification } from '../../products/types/product.types';
import { usePricingCardSpecCatalog } from '../hooks/usePricingCardTemplates';

/**
 * Product specification editor keyed off the pricing-card canonical spec
 * catalog. The template renderer only sees a spec row if its label matches one
 * of the canonical labels (via the `resolveSpec` alias list). Typing "Dimension"
 * instead of "Dimensions" — the exact case that first surfaced this — resolves
 * to nothing, and the card silently drops the row.
 *
 * So the label is a dropdown of catalog labels here, not a freeform text field:
 * one click picks the canonical label the resolver expects, and the value input
 * gets a per-key format hint (dimensions want `W × H × D mm`, capacity_l wants
 * the raw number with the L unit tacked on by the template, and so on). A
 * `Custom label…` escape hatch is kept for genuine one-off specs a template
 * does not know about — those still render in the generic spec list.
 */
export function CanonicalSpecEditor({
  value, notes, onChange, onNotesChange,
}: {
  value: ProductSpecification[];
  notes: string;
  onChange: (value: ProductSpecification[]) => void;
  onNotesChange: (value: string) => void;
}) {
  const catalog = usePricingCardSpecCatalog();
  const rows = value.length ? value : [{ label: '', value: '' }];
  const replace = (index: number, patch: Partial<ProductSpecification>) =>
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  const move = (index: number, offset: number) => {
    const next = [...rows];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const catalogLabels = new Set((catalog.data ?? []).map((item) => item.label));
  const catalogByLabel = new Map((catalog.data ?? []).map((item) => [item.label, item]));

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Specifications / المواصفات</h3>
          <p className="text-xs text-slate-500">Pick a canonical spec so the template can find it. Up to 40 rows.</p>
        </div>
        <button type="button" onClick={() => onChange([...rows, { label: '', value: '' }])} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
          <Plus className="h-4 w-4" />Add row
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => {
          const isCustom = row.label !== '' && !catalogLabels.has(row.label);
          const selected = isCustom ? '__custom__' : row.label;
          const catalogEntry = catalogByLabel.get(row.label);
          return (
            <div key={index} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
              <div className="space-y-1">
                <select
                  aria-label={`Specification ${index + 1} key`}
                  value={selected}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === '__custom__') replace(index, { label: row.label && !catalogLabels.has(row.label) ? row.label : '' });
                    else replace(index, { label: next });
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="">— pick a spec —</option>
                  {(catalog.data ?? []).map((item) => (
                    <option key={item.key} value={item.label}>
                      {item.label}{item.unit ? ` (${item.unit})` : ''}
                    </option>
                  ))}
                  <option value="__custom__">Custom label…</option>
                </select>
                {isCustom && (
                  <input
                    aria-label={`Specification ${index + 1} custom label`}
                    value={row.label}
                    onChange={(event) => replace(index, { label: event.target.value })}
                    placeholder="Custom label"
                    dir="auto"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                )}
              </div>
              <input
                aria-label={`Specification ${index + 1} value`}
                value={row.value}
                onChange={(event) => replace(index, { value: event.target.value })}
                placeholder={placeholderFor(row.label)}
                dir="auto"
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
              <div className="flex">
                <IconButton label="Move up" onClick={() => move(index, -1)}><ArrowUp /></IconButton>
                <IconButton label="Move down" onClick={() => move(index, 1)}><ArrowDown /></IconButton>
                <IconButton label="Remove" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 /></IconButton>
              </div>
              {catalogEntry && (
                <p className="col-span-3 -mt-1 text-xs text-slate-500">
                  {catalogEntry.group}{catalogEntry.unit ? ` — expected unit: ${catalogEntry.unit}` : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <label className="block text-sm font-medium">
        Specification notes / ملاحظات المواصفات
        <textarea
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          dir="auto"
          className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
    </section>
  );
}

const IconButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
  <button type="button" title={label} aria-label={label} onClick={onClick} className="p-2 text-slate-500 hover:text-slate-900 [&_svg]:h-4 [&_svg]:w-4">
    {children}
  </button>
);

/**
 * Per-key format hint. The template renderer only recognises dimensions
 * written as `W × H × D` with a length unit, so nudge the operator toward
 * that shape instead of letting them save `19x222x222` which parses to
 * millimetres but rewrites poorly if the template picks a different unit.
 */
function placeholderFor(label: string): string {
  switch (label) {
    case 'Dimensions': return 'e.g. 1111 × 697 × 280 mm';
    case 'Screen size': return 'e.g. 50';
    case 'Refresh rate': return 'e.g. 60';
    case 'Capacity (kg)': return 'e.g. 8';
    case 'Capacity (L)': return 'e.g. 350';
    case 'Spin speed': return 'e.g. 1400';
    case 'Battery runtime': return 'e.g. 90';
    case 'Weight': return 'e.g. 12.5';
    default: return 'Value / القيمة';
  }
}
