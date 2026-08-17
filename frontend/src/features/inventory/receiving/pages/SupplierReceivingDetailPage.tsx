import { ArrowLeft, Ban, FileCheck2, PencilLine, ReceiptText, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '../../../../components/ui';
import type { SupplierTransactionPrefill } from '../../../suppliers/components/SupplierTransactionFormDialog';
import type { SupplierReceiving, SupplierReceivingItem } from '../types/supplier-receiving.types';
import { useAuth } from '../../../../hooks/useAuth';
import { useSupplierReceiving } from '../hooks/useSupplierReceivings';
import { ReceivingMetadataDialog } from '../components/ReceivingMetadataDialog';
import { ReceivingVoidDialog } from '../components/ReceivingVoidDialog';
import { canCorrectReceiving, isReceivingVoided, receivingStatus, receivingStatusLabel } from '../utils/receiving-correction';

export function supplierDebtPrefillForReceiving(receiving: SupplierReceiving): SupplierTransactionPrefill {
  const identity = receiving.referenceNumber || receiving.receivedOn;
  return {
    type: 'SUPPLIER_DEBT',
    transactionDate: receiving.receivedOn,
    reference: receiving.referenceNumber ?? '',
    description: `Supplier receiving ${identity}`,
    supplierReceivingId: receiving.id,
  };
}

export const SupplierReceivingDetailPage: React.FC = () => {
  const { receivingId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const query = useSupplierReceiving(receivingId);
  const [editing, setEditing] = useState(false);
  const [voiding, setVoiding] = useState(false);
  if (query.isLoading) return <p className="rounded-xl border bg-white p-8 text-center text-slate-500">Loading receiving… / جارٍ تحميل المستند…</p>;
  if (query.isError || !query.data) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">Unable to load receiving document / تعذر تحميل مستند الإدخال</div>;
  const receiving = query.data;
  const voided = isReceivingVoided(receiving);
  const canCorrect = canCorrectReceiving(user?.role, receiving);
  const totalQuantity = (receiving.items ?? []).reduce((total, item) => total + item.quantity, 0);
  const linkedTransaction = receiving.transactions?.[0];
  const canRecordSupplierDebt = user?.role === 'ADMIN' && !voided && receiving.supplierId && receiving.supplier?.isActive && !linkedTransaction;
  return <div className="space-y-5">
    <header>
      <Link to="/inventory/receiving" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><ArrowLeft className="h-4 w-4" />Receiving history / سجل الإدخال</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">Receiving Document / مستند إدخال المخزون</h1><Badge tone={voided ? 'danger' : 'success'} icon={voided ? <Ban className="h-3.5 w-3.5" /> : <FileCheck2 className="h-3.5 w-3.5" />}>{receivingStatusLabel[receivingStatus(receiving)]}</Badge></div>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">{receiving.id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCorrect && <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"><PencilLine className="h-4 w-4" />Correct reference &amp; note / تعديل المرجع والملاحظة</button>}
          {canCorrect && <button type="button" onClick={() => setVoiding(true)} className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700"><Ban className="h-4 w-4" />Void receiving / إلغاء الإدخال</button>}
          {canRecordSupplierDebt && <button type="button" onClick={() => navigate(`/suppliers/${receiving.supplierId}`, { state: { prefillTransaction: supplierDebtPrefillForReceiving(receiving) } })} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"><ReceiptText className="h-4 w-4" />Record supplier debt / تسجيل دين للمورد</button>}
          {linkedTransaction && receiving.supplierId && <Link to={`/suppliers/${receiving.supplierId}`} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800"><ReceiptText className="h-4 w-4" />View linked supplier debt / عرض دين المورد المرتبط</Link>}
        </div>
      </div>
    </header>

    {voided
      ? <div role="status" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="flex items-center gap-2 font-semibold"><Ban className="h-5 w-5" />This receiving was voided and its stock has been reversed / تم إلغاء هذا المستند وعُكس مخزونه</p>
          <p className="mt-1">The document and its original stock movements are kept as history. / يُحتفظ بالمستند وحركات المخزون الأصلية كسجل تاريخي.</p>
          {receiving.voidReason && <p className="user-text mt-1" dir="auto">Reason / السبب: {receiving.voidReason}</p>}
          {receiving.voidedBy && <p className="mt-1 text-xs">Voided by {receiving.voidedBy.fullName} ({receiving.voidedBy.username}){receiving.voidedAt ? ` · ${new Date(receiving.voidedAt).toLocaleString()}` : ''}</p>}
        </div>
      : <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5" />Posted receiving document / مستند إدخال مُرحّل</p>
          <p className="mt-1">This document has already changed stock, so its lines are never edited in place. Admins can correct it with controlled correction actions. / غيّر هذا المستند المخزون فعلًا، لذلك لا تُعدَّل بنوده مباشرة. يمكن للمدير تصحيحه من خلال إجراءات تصحيح آمنة.</p>
        </div>}

    <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
      <Detail label="Received on / تاريخ الاستلام" value={receiving.receivedOn} />
      <Detail label="Supplier / المورد" value={receiving.supplier?.name ?? 'No supplier / بدون مورّد'} userText />
      <Detail label="Reference / المرجع" value={receiving.referenceNumber ?? '—'} />
      <Detail label="Received by / المستلم" value={receiving.receivedBy ? `${receiving.receivedBy.fullName} (${receiving.receivedBy.username})` : '—'} />
      <Detail label="Created / تاريخ الإنشاء" value={new Date(receiving.createdAt).toLocaleString()} />
      <Detail label="Total quantity / إجمالي الكمية" value={String(totalQuantity)} />
      {receiving.note && <div className="sm:col-span-2 lg:col-span-3"><Detail label="Note / الملاحظة" value={receiving.note} userText /></div>}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3"><h2 className="font-bold">Received products / المنتجات المستلمة</h2></div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Product / المنتج</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Quantity / الكمية</th><th className="px-4 py-3">Stock change / تغير المخزون</th><th className="px-4 py-3">Line status / حالة البند</th><th className="px-4 py-3">Movement / الحركة</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{receiving.items?.map((item) => <ItemRow key={item.id} item={item} />)}</tbody>
      </table></div>
    </section>

    {Boolean(receiving.audits?.length) && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3"><h2 className="font-bold">Correction history / سجل التصحيحات</h2></div>
      <ul className="divide-y divide-slate-100">{receiving.audits?.map((entry) => <li key={entry.id} className="px-5 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{entry.action === 'VOID' ? 'Voided / إلغاء' : 'Reference & note corrected / تصحيح المرجع والملاحظة'}</strong><time className="text-xs text-slate-500">{new Date(entry.changedAt).toLocaleString()}</time></div>
        <p className="user-text mt-1 text-slate-700" dir="auto">{entry.reason}</p>
        <p className="mt-1 text-xs text-slate-500">{entry.changedByName} ({entry.changedByUsername})</p>
      </li>)}</ul>
    </section>}

    {canCorrect && editing && <ReceivingMetadataDialog receiving={receiving} isOpen onClose={() => setEditing(false)} />}
    {canCorrect && voiding && <ReceivingVoidDialog receiving={receiving} isOpen onClose={() => setVoiding(false)} />}
  </div>;
};

/**
 * A reversed line keeps its original balances on the row and states the reversal
 * beneath them, so the page never rewrites what the receipt originally did.
 */
const ItemRow: React.FC<{ item: SupplierReceivingItem }> = ({ item }) => {
  const reversed = (item.status ?? 'ACTIVE') === 'REVERSED';
  return <tr className={reversed ? 'bg-red-50/40' : undefined}>
    <td className="user-text px-4 py-3 font-semibold" dir="auto">{item.product.name}</td>
    <td className="px-4 py-3 font-mono text-xs">{item.product.sku}</td>
    <td className="px-4 py-3 font-bold tabular-nums">+{item.quantity}</td>
    <td className="px-4 py-3 tabular-nums">
      {item.stockMovement.quantityBefore} → {item.stockMovement.quantityAfter}
      {reversed && item.reversalStockMovement && <span className="mt-0.5 block text-xs text-red-700">Reversed / معكوس: {item.reversalStockMovement.quantityBefore} → {item.reversalStockMovement.quantityAfter}</span>}
    </td>
    <td className="px-4 py-3"><Badge tone={reversed ? 'danger' : 'success'}>{reversed ? 'Reversed / معكوس' : 'Active / نشط'}</Badge></td>
    <td className="break-all px-4 py-3 font-mono text-xs text-slate-500">
      {item.stockMovementId}
      {reversed && item.reversalStockMovementId && <span className="mt-0.5 block text-red-700">{item.reversalStockMovementId}</span>}
    </td>
  </tr>;
};

const Detail: React.FC<{ label: string; value: string; userText?: boolean }> = ({ label, value, userText }) => <div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className={`mt-1 ${userText ? 'user-text' : ''}`} dir={userText ? 'auto' : undefined}>{value}</p></div>;
