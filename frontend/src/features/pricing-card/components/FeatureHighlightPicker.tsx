import type { PricingCardFeature } from '../types/pricing-card.types';

interface FeatureHighlightPickerProps {
  features: PricingCardFeature[];
  selectedCodes: string[];
  max: number;
  onToggle: (code: string) => void;
  onReset: () => void;
}

export function FeatureHighlightPicker({ features, selectedCodes, max, onToggle, onReset }: FeatureHighlightPickerProps) {
  if (!features.length) return null;
  return (
    <section className="no-print rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-800">Feature highlights</h2>
        <button type="button" onClick={onReset} className="text-xs font-semibold text-brand-700 underline">Reset to defaults</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {features.map((feature) => {
          const checked = selectedCodes.includes(feature.iconCode);
          const atLimit = !checked && selectedCodes.length >= max;
          return (
            <label key={feature.iconCode} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={checked} disabled={atLimit} onChange={() => onToggle(feature.iconCode)} />
              {feature.label}{feature.value ? ` — ${feature.value}` : ''}
            </label>
          );
        })}
      </div>
    </section>
  );
}
