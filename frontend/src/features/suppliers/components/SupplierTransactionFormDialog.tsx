import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Modal } from '../../../components/ui/Modal';
import { businessLabels } from '../../../shared/labels/business-labels';
import { canonicalMoneyInput, sanitizeMoneyInput } from '../../customer-financial/utils/money-input';
import { normalizeFinancialError } from '../../customer-financial/utils/financial-form-errors';
import { todayAsBusinessDate } from '../../customer-financial/utils/business-date';
import { useSupplierTransactionMutations } from '../hooks/useSupplierMutations';
import { Supplier, SupplierTransaction, SupplierTransactionDirection, SupplierTransactionType } from '../types/supplier.types';
import { supplierDirectionLabels, supplierTransactionTypeLabels } from '../utils/supplier-labels';
import { useSupplierReceiving, useSupplierReceivings } from '../../inventory/receiving/hooks/useSupplierReceivings';

type SupplierIdentity = Pick<Supplier, 'id'|'name'|'phone'>;

interface Props {
  open: boolean;
  supplier: SupplierIdentity;
  transaction?: SupplierTransaction | null;
  prefill?: SupplierTransactionPrefill | null;
  onClose: () => void;
}

export interface SupplierTransactionPrefill {
  type?: SupplierTransactionType;
  transactionDate?: string;
  description?: string;
  reference?: string;
  notes?: string;
  supplierReceivingId?: string;
}

const emptyForm = () => ({
  type: 'SUPPLIER_DEBT' as SupplierTransactionType,
  direction: '' as SupplierTransactionDirection|'',
  amount: '',
  transactionDate: todayAsBusinessDate(),
  description: '',
  reference: '',
  notes: '',
  reason: '',
  accountPassword: '',
  supplierReceivingId: '',
});

export const supplierTransactionFormFromPrefill = (prefill?: SupplierTransactionPrefill | null) => ({
  ...emptyForm(),
  ...prefill,
  amount: '',
});

export const SupplierTransactionFormDialog: React.FC<Props> = ({ open, supplier, transaction, prefill, onClose }) => {
  const mutations = useSupplierTransactionMutations();
  const mutation = transaction ? mutations.update : mutations.create;
  const [form, setForm] = useState(() => supplierTransactionFormFromPrefill(prefill));
  const canChooseReceiving = open && !transaction && form.type === 'SUPPLIER_DEBT';
  const receivings = useSupplierReceivings({ supplierId: supplier.id, page: 1, pageSize: 100 }, canChooseReceiving);
  const selectedReceiving = useSupplierReceiving(open ? form.supplierReceivingId : '');

  useEffect(() => {
    if (!transaction) { setForm(supplierTransactionFormFromPrefill(prefill)); return; }
    setForm({ type: transaction.type, direction: transaction.direction, amount: transaction.amount, transactionDate: transaction.transactionDate, description: transaction.description, reference: transaction.reference ?? '', notes: transaction.notes ?? '', reason: '', accountPassword: '', supplierReceivingId: transaction.supplierReceivingId ?? '' });
  }, [transaction, prefill, open]);

  const set = (key: keyof ReturnType<typeof emptyForm>) => (event: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const input = { type: form.type, direction: form.type === 'SUPPLIER_ADJUSTMENT' ? (form.direction || undefined) as SupplierTransactionDirection|undefined : undefined, amount: canonicalMoneyInput(form.amount), transactionDate: form.transactionDate, description: form.description, reference: form.reference || null, notes: form.notes || null };
      if (transaction) await mutations.update.mutateAsync({ id: transaction.id, input: { ...input, reason: form.reason, accountPassword: form.accountPassword } });
      else await mutations.create.mutateAsync({ supplierId: supplier.id, input: { ...input, supplierReceivingId: form.supplierReceivingId || null } });
      onClose();
    } catch (error) { toast.error(normalizeFinancialError(error).message); }
  };

  return <Modal isOpen={open} onClose={onClose} title={transaction ? 'Edit Transaction / تعديل حركة' : businessLabels.supplier.addTransaction} maxWidth="max-w-2xl">
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-md bg-slate-50 p-3"><p className="user-text font-semibold" dir="auto">{supplier.name}</p><p className="text-sm text-slate-500">{supplier.phone}</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Type / النوع<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as SupplierTransactionType, supplierReceivingId: event.target.value === 'SUPPLIER_DEBT' ? current.supplierReceivingId : '' }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal">{Object.entries(supplierTransactionTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {form.type === 'SUPPLIER_ADJUSTMENT' && <label className="text-sm font-semibold">Direction / الاتجاه<select required value={form.direction} onChange={set('direction')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal"><option value="">Select / اختر</option>{Object.entries(supplierDirectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <Field label={businessLabels.supplier.amount} required inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: sanitizeMoneyInput(event.target.value) }))} />
        <Field label={businessLabels.supplier.date} required type="date" value={form.transactionDate} onChange={set('transactionDate')} />
      </div>
      {form.type === 'SUPPLIER_DEBT' && <section className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
        <label className="block text-sm font-semibold text-slate-700">Receiving document (optional) / مستند الإدخال (اختياري)
          {transaction ? <div className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2 font-normal">{transaction.supplierReceiving ? receivingLabel(transaction.supplierReceiving) : 'Not linked / غير مرتبط'}</div> : <select value={form.supplierReceivingId} onChange={set('supplierReceivingId')} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-normal">
            <option value="">No receiving document / بدون مستند إدخال</option>
            {receivings.data?.items.map((receiving) => <option key={receiving.id} value={receiving.id} disabled={Boolean(receiving._count?.transactions)}>{receiving.receivedOn} · {receiving.referenceNumber || 'No reference'} · {receiving._count?.items ?? 0} product(s){receiving._count?.transactions ? ' · Already linked' : ''}</option>)}
          </select>}
        </label>
        {form.supplierReceivingId ? <>
          <Link to={`/inventory/receiving/${form.supplierReceivingId}`} className="inline-flex text-sm font-semibold text-emerald-700 hover:underline">View receiving document / عرض مستند الإدخال</Link>
          <div><p className="text-sm font-semibold">Products / المنتجات</p>{selectedReceiving.isLoading ? <p className="mt-1 text-sm text-slate-500">Loading products… / جارٍ تحميل المنتجات…</p> : selectedReceiving.data?.items?.length ? <ul className="mt-1 divide-y divide-blue-100 rounded-md bg-white px-3">{selectedReceiving.data.items.map((item) => <li key={item.id} className="flex justify-between gap-3 py-2 text-sm"><span className="user-text" dir="auto">{item.product.name} · {item.product.sku}</span><strong className="tabular-nums">× {item.quantity}</strong></li>)}</ul> : <p className="mt-1 text-sm text-slate-500">Unable to load receiving products / تعذر تحميل منتجات المستند</p>}</div>
        </> : <p className="text-sm text-slate-500">Select a receiving document to show its products / اختر مستند إدخال لعرض منتجاته</p>}
      </section>}
      <Field label={businessLabels.supplier.description} required value={form.description} onChange={set('description')} />
      <div className="grid gap-4 sm:grid-cols-2"><Field label={businessLabels.supplier.reference} value={form.reference} onChange={set('reference')} /><Field label={businessLabels.supplier.notes} value={form.notes} onChange={set('notes')} /></div>
      {transaction && <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2"><Field label={businessLabels.supplier.reason} required value={form.reason} onChange={set('reason')} /><Field label={businessLabels.supplier.accountPassword} required type="password" value={form.accountPassword} onChange={set('accountPassword')} /></div>}
      <button disabled={mutation.isPending} className="w-full rounded-md bg-emerald-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Saving... / جارٍ الحفظ' : businessLabels.common.save}</button>
    </form>
  </Modal>;
};

const Field: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, ...props }) => <label className="block text-sm font-semibold text-slate-700">{label}<input {...props} dir="auto" className="user-text-input mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" /></label>;

function receivingLabel(receiving: NonNullable<SupplierTransaction['supplierReceiving']>): string {
  return `${receiving.receivedOn} · ${receiving.referenceNumber || 'No reference'} · ${receiving.items.length} product(s)`;
}
