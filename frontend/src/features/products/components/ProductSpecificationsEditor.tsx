import React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { ProductSpecification } from '../types/product.types';

export const ProductSpecificationsEditor: React.FC<{ value: ProductSpecification[]; notes: string; onChange: (value: ProductSpecification[]) => void; onNotesChange: (value: string) => void }> = ({ value, notes, onChange, onNotesChange }) => {
  const rows = value.length ? value : [{ label: '', value: '' }];
  const replace = (index: number, patch: Partial<ProductSpecification>) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const move = (index: number, offset: number) => { const next = [...rows]; const target = index + offset; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  return <section className="space-y-3 rounded-lg border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Specifications / المواصفات</h3><p className="text-xs text-slate-500">Up to 40 descriptive key/value rows.</p></div><button type="button" onClick={() => onChange([...rows, { label: '', value: '' }])} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><Plus className="h-4 w-4" />Add row</button></div>
    <div className="space-y-2">{rows.map((row, index) => <div key={index} className="grid grid-cols-[1fr_1.4fr_auto] gap-2"><input aria-label={`Specification ${index + 1} label`} value={row.label} onChange={(event) => replace(index, { label: event.target.value })} placeholder="Label / البيان" dir="auto" className="rounded-lg border border-slate-300 px-3 py-2" /><input aria-label={`Specification ${index + 1} value`} value={row.value} onChange={(event) => replace(index, { value: event.target.value })} placeholder="Value / القيمة" dir="auto" className="rounded-lg border border-slate-300 px-3 py-2" /><div className="flex"><IconButton label="Move up" onClick={() => move(index, -1)}><ArrowUp /></IconButton><IconButton label="Move down" onClick={() => move(index, 1)}><ArrowDown /></IconButton><IconButton label="Remove" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 /></IconButton></div></div>)}</div>
    <label className="block text-sm font-medium">Specification notes / ملاحظات المواصفات<textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} dir="auto" className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
  </section>;
};

const IconButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => <button type="button" title={label} aria-label={label} onClick={onClick} className="p-2 text-slate-500 hover:text-slate-900 [&_svg]:h-4 [&_svg]:w-4">{children}</button>;
