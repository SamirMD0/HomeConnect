import { ArrowLeft, LockKeyhole } from 'lucide-react';
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSupplierReceiving } from '../hooks/useSupplierReceivings';

export const SupplierReceivingDetailPage: React.FC = () => {
  const { receivingId = '' } = useParams();
  const query = useSupplierReceiving(receivingId);
  if (query.isLoading) return <p className="rounded-xl border bg-white p-8 text-center text-slate-500">Loading receiving… / جارٍ تحميل المستند…</p>;
  if (query.isError || !query.data) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">Unable to load receiving document / تعذر تحميل مستند الإدخال</div>;
  const receiving = query.data;
  const totalQuantity = (receiving.items ?? []).reduce((total, item) => total + item.quantity, 0);
  return <div className="space-y-5">
    <header><Link to="/inventory/receiving" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><ArrowLeft className="h-4 w-4" />Receiving history / سجل الإدخال</Link><h1 className="text-2xl font-bold">Receiving Document / مستند إدخال المخزون</h1><p className="mt-1 break-all font-mono text-xs text-slate-500">{receiving.id}</p></header>
    <div role="status" className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900"><LockKeyhole className="h-5 w-5" />This receiving document is immutable / هذا المستند غير قابل للتعديل</div>
    <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
      <Detail label="Received on / تاريخ الاستلام" value={receiving.receivedOn} />
      <Detail label="Supplier / المورد" value={receiving.supplier?.name ?? 'No supplier / بدون مورّد'} userText />
      <Detail label="Reference / المرجع" value={receiving.referenceNumber ?? '—'} />
      <Detail label="Received by / المستلم" value={receiving.receivedBy ? `${receiving.receivedBy.fullName} (${receiving.receivedBy.username})` : '—'} />
      <Detail label="Created / تاريخ الإنشاء" value={new Date(receiving.createdAt).toLocaleString()} />
      <Detail label="Total quantity / إجمالي الكمية" value={String(totalQuantity)} />
      {receiving.note && <div className="sm:col-span-2 lg:col-span-3"><Detail label="Note / الملاحظة" value={receiving.note} userText /></div>}
    </section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-3"><h2 className="font-bold">Received products / المنتجات المستلمة</h2></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Product / المنتج</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Quantity / الكمية</th><th className="px-4 py-3">Stock change / تغير المخزون</th><th className="px-4 py-3">Movement / الحركة</th></tr></thead><tbody className="divide-y divide-slate-100">{receiving.items?.map((item) => <tr key={item.id}><td className="user-text px-4 py-3 font-semibold" dir="auto">{item.product.name}</td><td className="px-4 py-3 font-mono text-xs">{item.product.sku}</td><td className="px-4 py-3 font-bold tabular-nums">+{item.quantity}</td><td className="px-4 py-3 tabular-nums">{item.stockMovement.quantityBefore} → {item.stockMovement.quantityAfter}</td><td className="break-all px-4 py-3 font-mono text-xs text-slate-500">{item.stockMovementId}</td></tr>)}</tbody></table></div></section>
  </div>;
};

const Detail: React.FC<{ label: string; value: string; userText?: boolean }> = ({ label, value, userText }) => <div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className={`mt-1 ${userText ? 'user-text' : ''}`} dir={userText ? 'auto' : undefined}>{value}</p></div>;
