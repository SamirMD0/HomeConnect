import { useId } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ProductSpecification } from '../../products/types/product.types';
import { dimensionDraftFromValue, dimensionValueFromDraft, type DimensionDraft } from '../../products/utils/dimension-specification';
import { usePricingCardSpecCatalog } from '../hooks/usePricingCardTemplates';

/**
 * Product specification editor keyed off the pricing-card canonical spec
 * catalog. The template renderer only sees a spec row if its label matches one
 * of the canonical labels (via the `resolveSpec` alias list). Typing "Dimension"
 * instead of "Dimensions" — the exact case that first surfaced this — resolves
 * to nothing, and the card silently drops the row.
 *
 * The label input suggests catalog labels but remains typeable for genuine
 * product-specific details. Once a custom label is saved on a product, the
 * server adds it to the shared suggestions for later products. Canonical labels
 * still provide per-key format hints (dimensions use dedicated W/H/D inputs).
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
  const labelListId = useId();
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

  const catalogByLabel = new Map((catalog.data ?? []).map((item) => [item.label, item]));

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Specifications / المواصفات</h3>
          <p className="text-xs text-slate-500">Choose a saved label or type a new one. Custom labels are remembered after Save. Up to 40 rows.</p>
        </div>
        <button type="button" onClick={() => onChange([...rows, { label: '', value: '' }])} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
          <Plus className="h-4 w-4" />Add row
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => {
          const catalogEntry = catalogByLabel.get(row.label);
          return (
            <div key={index} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
              <div className="space-y-1">
                <input
                  aria-label={`Specification ${index + 1} key`}
                  list={labelListId}
                  value={row.label}
                  onChange={(event) => replace(index, { label: event.target.value })}
                  placeholder="Choose or type a custom label"
                  dir="auto"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                />
              </div>
              {row.label === 'Dimensions'
                ? <DimensionInputs value={row.value} onChange={(value) => replace(index, { value })} />
                : <input
                    aria-label={`Specification ${index + 1} value`}
                    value={row.value}
                    onChange={(event) => replace(index, { value: event.target.value })}
                    placeholder={placeholderFor(row.label)}
                    dir="auto"
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  />}
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
      <datalist id={labelListId}>
        {(catalog.data ?? []).map((item) => (
          <option key={item.key} value={item.label}>{item.unit ? `${item.group} · ${item.unit}` : item.group}</option>
        ))}
      </datalist>
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

export function DimensionInputs({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const draft = dimensionDraftFromValue(value);
  const change = (field: keyof DimensionDraft, nextValue: string) =>
    onChange(dimensionValueFromDraft({ ...draft, [field]: nextValue }));

  return (
    <div className="grid grid-cols-3 gap-2">
      <DimensionInput axis="W" label="Width" value={draft.width} onChange={(next) => change('width', next)} />
      <DimensionInput axis="H" label="Height" value={draft.height} onChange={(next) => change('height', next)} />
      <DimensionInput axis="D" label="Depth" value={draft.depth} onChange={(next) => change('depth', next)} />
    </div>
  );
}

function DimensionInput({ axis, label, value, onChange }: { axis: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-xs font-medium text-slate-600">
      <span>{axis} · {label} (mm)</span>
      <input
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        aria-label={`${label} mm`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
      />
    </label>
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
