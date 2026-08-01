import React from 'react';
import { ProductLabelDimensions, saveProductLabelDimensions } from '../utils/product-label-settings';

export const ProductLabelPrintSettings: React.FC<{
  dimensions: ProductLabelDimensions;
  onChange: (value: ProductLabelDimensions) => void;
  showCode: boolean;
  onShowCodeChange: (value: boolean) => void;
  showPrice: boolean;
  onShowPriceChange: (value: boolean) => void;
}> = ({ dimensions, onChange, showCode, onShowCodeChange, showPrice, onShowPriceChange }) => {
  const change = (field: keyof ProductLabelDimensions, raw: string) => {
    const value = Number(raw); if (!Number.isFinite(value)) return;
    const next = { ...dimensions, [field]: value }; onChange(next); saveProductLabelDimensions(next);
  };
  const setAutoFit = (autoFit: boolean) => { const next = { ...dimensions, autoFit }; onChange(next); saveProductLabelDimensions(next); };
  const pageSize = dimensions.autoFit ? 'auto' : `${dimensions.widthMm}mm ${dimensions.heightMm}mm`;
  return <><style>{`@media print { @page { size: ${pageSize}; margin: 0; } }`}</style><div className="no-print flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3"><label className="flex h-10 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!dimensions.autoFit} onChange={(event) => setAutoFit(!event.target.checked)} />Manual label size</label>{!dimensions.autoFit && <><NumberSetting label="Width mm" value={dimensions.widthMm} onChange={(value) => change('widthMm', value)} /><NumberSetting label="Height mm" value={dimensions.heightMm} onChange={(value) => change('heightMm', value)} /></>}<label className="flex h-10 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={showPrice} onChange={(event) => onShowPriceChange(event.target.checked)} />Show selling price</label><label className="flex h-10 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={showCode} onChange={(event) => onShowCodeChange(event.target.checked)} />Show staff code</label><p className="basis-full text-xs text-slate-500">Auto fit expands the label for its content. Use manual size only when matching fixed sticker stock.</p></div></>;
};
const NumberSetting: React.FC<{ label: string; value: number; onChange: (value: string) => void }> = ({ label, value, onChange }) => <label className="text-xs font-medium text-slate-600">{label}<input type="number" min="20" max="150" step="1" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block h-9 w-24 rounded-md border border-slate-300 px-2 text-sm" /></label>;
