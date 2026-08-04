import React from 'react';
import { LabelSheetLayout, LabelPaperSize, PAPER_CSS_SIZE } from '../utils/label-sheet-layout';
import { ProductLabelSheetSettings, saveProductLabelSheetSettings } from '../utils/product-label-settings';

interface LabelSheetLayoutControlsProps {
  settings: ProductLabelSheetSettings;
  onChange: (value: ProductLabelSheetSettings) => void;
  layout: LabelSheetLayout;
  showPrice: boolean;
  onShowPriceChange: (value: boolean) => void;
  showPriceCode: boolean;
  onShowPriceCodeChange: (value: boolean) => void;
}

/**
 * Layout controls plus the injected `@page` rule.
 *
 * `@page` is a document-level rule that cannot be scoped by selector, so the
 * only way to switch paper size at runtime is to inject it — the same technique
 * `ProductLabelPrintSettings` already uses for single stickers.
 */
export const LabelSheetLayoutControls: React.FC<LabelSheetLayoutControlsProps> = ({
  settings, onChange, layout, showPrice, onShowPriceChange, showPriceCode, onShowPriceCodeChange,
}) => {
  const update = (patch: Partial<ProductLabelSheetSettings>) => {
    const next = { ...settings, ...patch };
    onChange(next);
    saveProductLabelSheetSettings(next);
  };

  const changeNumber = (field: 'labelWidthMm' | 'labelHeightMm' | 'pageMarginMm' | 'labelGapMm', raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    update({ [field]: value } as Partial<ProductLabelSheetSettings>);
  };

  // Sheet mode prints a full page of labels; sticker mode keeps one label per
  // page for die-cut stock. Margin is applied by the page element, not the
  // printer, so mixing the two cannot push the last row off the sheet.
  const pageSize = settings.mode === 'SHEET'
    ? `${PAPER_CSS_SIZE[settings.paper]} portrait`
    : `${settings.labelWidthMm}mm ${settings.labelHeightMm}mm`;

  return (
    <>
      <style>{`@media print { @page { size: ${pageSize}; margin: 0; } }`}</style>

      <div className="no-print space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Print mode">
            <select
              value={settings.mode}
              onChange={(event) => update({ mode: event.target.value === 'STICKER' ? 'STICKER' : 'SHEET' })}
              className="mt-1 block h-9 rounded-md border border-slate-300 px-2 text-sm"
            >
              <option value="SHEET">Sheet — cut by hand</option>
              <option value="STICKER">Sticker stock — one per page</option>
            </select>
          </Field>

          {settings.mode === 'SHEET' && (
            <Field label="Paper">
              <select
                value={settings.paper}
                onChange={(event) => update({ paper: event.target.value as LabelPaperSize })}
                className="mt-1 block h-9 rounded-md border border-slate-300 px-2 text-sm"
              >
                <option value="A4">A4</option>
                <option value="LETTER">Letter</option>
              </select>
            </Field>
          )}

          <NumberField label="Label width mm" value={settings.labelWidthMm} min={20} max={150} onChange={(value) => changeNumber('labelWidthMm', value)} />
          <NumberField label="Label height mm" value={settings.labelHeightMm} min={20} max={150} onChange={(value) => changeNumber('labelHeightMm', value)} />

          {settings.mode === 'SHEET' && (
            <>
              <NumberField label="Page margin mm" value={settings.pageMarginMm} min={0} max={30} onChange={(value) => changeNumber('pageMarginMm', value)} />
              <NumberField label="Gap mm" value={settings.labelGapMm} min={0} max={30} onChange={(value) => changeNumber('labelGapMm', value)} />
              <Field label="Columns">
                <select
                  value={String(settings.columns)}
                  onChange={(event) => update({ columns: event.target.value === 'AUTO' ? 'AUTO' : Number(event.target.value) })}
                  className="mt-1 block h-9 rounded-md border border-slate-300 px-2 text-sm"
                >
                  <option value="AUTO">Auto</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </Field>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3">
          {settings.mode === 'SHEET' && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={settings.showCutGuides} onChange={(event) => update({ showCutGuides: event.target.checked })} />
              Cut guides / خطوط القص
            </label>
          )}
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={showPrice} onChange={(event) => onShowPriceChange(event.target.checked)} />
            Show selling price / إظهار السعر
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={showPriceCode} onChange={(event) => onShowPriceCodeChange(event.target.checked)} />
            Price code in SKU / رمز السعر ضمن الرمز
          </label>

          {settings.mode === 'SHEET' && layout.canPrint && (
            <p className="ml-auto text-xs font-medium text-slate-600">
              {layout.columns} × {layout.rows} = {layout.perPage} per page · {layout.pages} page{layout.pages === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {layout.problems.length > 0 && (
          <ul className="space-y-1 border-t border-slate-100 pt-3">
            {layout.problems.map((problem) => (
              <li
                key={problem.code}
                role={problem.blocking ? 'alert' : 'status'}
                className={`text-xs font-medium ${problem.blocking ? 'text-red-700' : 'text-amber-800'}`}
              >
                {problem.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="text-xs font-medium text-slate-600">{label}{children}</label>
);

const NumberField: React.FC<{ label: string; value: number; min: number; max: number; onChange: (value: string) => void }> = ({ label, value, min, max, onChange }) => (
  <Field label={label}>
    <input
      type="number"
      min={min}
      max={max}
      step="1"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1 block h-9 w-24 rounded-md border border-slate-300 px-2 text-sm"
    />
  </Field>
);
