import React from 'react';
import { MinusCircle } from 'lucide-react';
import type { OnboardingWorklistItem } from '../types/inventory.types';
import type { OnboardingSelection } from '../utils/onboarding-batch';

interface Props {
  items: OnboardingWorklistItem[];
  selection: OnboardingSelection;
  invalidProductIds: Set<string>;
  loading?: boolean;
  onToggle: (product: OnboardingWorklistItem, selected: boolean) => void;
  onCountChange: (productId: string, count: number | '') => void;
  onNoteChange: (productId: string, note: string) => void;
  onRemove: (productId: string) => void;
}

export const InventoryOnboardingTable: React.FC<Props> = ({
  items, selection, invalidProductIds, loading, onToggle, onCountChange, onNoteChange, onRemove,
}) => {
  if (loading) return <p className="p-10 text-center text-sm text-slate-500">Loading products / جارٍ تحميل المنتجات…</p>;
  if (!items.length) return <p className="p-10 text-center text-sm text-slate-500">No products awaiting onboarding / لا توجد منتجات بانتظار الإدراج</p>;

  return <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm">
    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr>
      <th className="px-3 py-3">Select / تحديد</th><th className="px-3 py-3">Name / الاسم</th>
      <th className="px-3 py-3">Model / Brand</th><th className="px-3 py-3">SKU / Barcode</th>
      <th className="px-3 py-3">Status / الحالة</th><th className="min-w-56 px-3 py-3">Opening count / الجرد الافتتاحي</th>
    </tr></thead>
    <tbody className="divide-y divide-slate-100 bg-white">{items.map((item) => {
      const selected = selection.get(item.productId);
      const invalid = invalidProductIds.has(item.productId);
      return <tr key={item.productId} className={selected ? 'bg-emerald-50/40' : undefined}>
        <td className="px-3 py-3 align-top"><input aria-label={`Select ${item.name}`} type="checkbox" checked={Boolean(selected)} onChange={(event) => onToggle(item, event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" /></td>
        <td className="px-3 py-3 align-top"><strong className="user-text block max-w-64" dir="auto">{item.name}</strong></td>
        <td className="px-3 py-3 align-top text-slate-600"><span dir="auto" className="user-text block">{item.model}</span><span dir="auto" className="user-text text-xs text-slate-400">{item.brand || '—'}</span></td>
        <td className="px-3 py-3 align-top font-mono text-xs text-slate-600"><span className="block">{item.sku}</span><span className="text-slate-400">{item.barcode || '—'}</span></td>
        <td className="px-3 py-3 align-top"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'NOT_IN_INVENTORY' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>{item.status === 'NOT_IN_INVENTORY' ? 'Never onboarded / غير مُدرج' : 'Pending / معلّق'}</span></td>
        <td className="px-3 py-3 align-top"><div className="space-y-2">
          <input id={`opening-count-${item.productId}`} aria-label={`Opening count for ${item.name}`} type="number" min="0" step="1" disabled={!selected} value={selected?.count ?? ''} onChange={(event) => onCountChange(item.productId, event.target.value === '' ? '' : Number(event.target.value))} className={`w-full rounded-lg border px-3 py-2 tabular-nums disabled:bg-slate-100 ${invalid ? 'border-red-500' : 'border-slate-300'}`} />
          {selected && <><input dir="auto" aria-label={`Note for ${item.name}`} value={selected.note} onChange={(event) => onNoteChange(item.productId, event.target.value)} placeholder="Note (optional) / ملاحظة" className="user-text-input w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" /><button type="button" onClick={() => onRemove(item.productId)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><MinusCircle className="h-3.5 w-3.5" />Remove / إزالة</button></>}
        </div></td>
      </tr>;
    })}</tbody>
  </table></div>;
};
