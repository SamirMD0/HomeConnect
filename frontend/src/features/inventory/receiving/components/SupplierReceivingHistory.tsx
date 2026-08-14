import { Boxes, ExternalLink } from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '../../../../components/ui';
import { useSupplierReceivings } from '../hooks/useSupplierReceivings';

export const SupplierReceivingHistory: React.FC<{ supplierId: string }> = ({ supplierId }) => {
  const [page, setPage] = useState(1);
  const query = useSupplierReceivings({ supplierId, page, pageSize: 10 });

  return <section aria-labelledby="supplier-receiving-history" className="overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
    <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-3">
      <div className="flex items-center gap-2"><Boxes className="h-5 w-5 text-emerald-700" /><h2 id="supplier-receiving-history" className="text-lg font-bold">Receiving History / سجل إدخال المخزون</h2></div>
      <p className="mt-1 text-xs text-emerald-900/70">Inventory documents only — separate from financial transactions / مستندات مخزون فقط — منفصلة عن الحركات المالية</p>
    </div>
    {query.isLoading ? <p className="p-6 text-center text-sm text-slate-500">Loading receiving history… / جارٍ تحميل سجل الإدخال…</p> : query.isError ? <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load receiving history / تعذر تحميل سجل الإدخال</div> : query.data?.items.length ? <>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Received on / تاريخ الاستلام</th><th className="px-4 py-3">Reference / المرجع</th><th className="px-4 py-3">Items / الأصناف</th><th className="px-4 py-3">Received by / المستلم</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{query.data.items.map((receiving) => <tr key={receiving.id}><td className="px-4 py-3 font-semibold">{receiving.receivedOn}</td><td className="px-4 py-3">{receiving.referenceNumber || '—'}</td><td className="px-4 py-3 tabular-nums">{receiving._count?.items ?? receiving.items?.length ?? 0}</td><td className="px-4 py-3">{receiving.receivedBy ? `${receiving.receivedBy.fullName} (${receiving.receivedBy.username})` : '—'}</td><td className="px-4 py-3"><Link to={`/inventory/receiving/${receiving.id}`} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">View / عرض <ExternalLink className="h-3.5 w-3.5" /></Link></td></tr>)}</tbody></table></div>
      <div className="border-t border-slate-100 p-3"><Pagination currentPage={page} totalPages={query.data.pagination.totalPages} onPageChange={setPage} /></div>
    </> : <p className="p-6 text-center text-sm text-slate-500">No receiving documents for this supplier / لا توجد مستندات إدخال لهذا المورد</p>}
  </section>;
};
