import React from 'react';
import { ProductLabelDimensions, saveProductLabelDimensions } from '../utils/product-label-settings';

export const ProductLabelPrintSettings: React.FC<{
  dimensions: ProductLabelDimensions;
  onChange: (value: ProductLabelDimensions) => void;
  showCode: boolean;
  onShowCodeChange: (value: boolean) => void;
}> = ({ dimensions, onChange, showCode, onShowCodeChange }) => {
  const change = (field: keyof ProductLabelDimensions, raw: string) => {
    const value = Number(raw); if (!Number.isFinite(value)) return;
    const next = { ...dimensions, [field]: value }; onChange(next); saveProductLabelDimensions(next);
  };
  return <><style>{`@media print { @page { size: ${dimensions.widthMm}mm ${dimensions.heightMm}mm; margin: 0; } }`}</style><div className="no-print flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3"><NumberSetting label="Width mm" value={dimensions.widthMm} onChange={(value) => change('widthMm', value)} /><NumberSetting label="Height mm" value={dimensions.heightMm} onChange={(value) => change('heightMm', value)} /><label className="flex h-10 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={showCode} onChange={(event) => onShowCodeChange(event.target.checked)} />Show internal code</label><p className="basis-full text-xs text-slate-500">Saved on this PC for the connected label printer. Default: 50 × 30 mm.</p></div></>;
};
const NumberSetting: React.FC<{ label: string; value: number; onChange: (value: string) => void }> = ({ label, value, onChange }) => <label className="text-xs font-medium text-slate-600">{label}<input type="number" min="20" max="150" step="1" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block h-9 w-24 rounded-md border border-slate-300 px-2 text-sm" /></label>;
