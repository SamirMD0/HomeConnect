import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui/Modal';
import { businessLabels } from '../../../shared/labels/business-labels';
import { canonicalMoneyInput, sanitizeMoneyInput } from '../../customer-financial/utils/money-input';
import { normalizeFinancialError } from '../../customer-financial/utils/financial-form-errors';
import { todayAsBusinessDate } from '../../customer-financial/utils/business-date';
import { useSupplierTransactionMutations } from '../hooks/useSupplierMutations';
import { Supplier, SupplierTransaction, SupplierTransactionDirection, SupplierTransactionType } from '../types/supplier.types';
import { supplierDirectionLabels, supplierTransactionTypeLabels } from '../utils/supplier-labels';

type SupplierIdentity = Pick<Supplier, 'id'|'name'|'phone'>;

interface Props {
  open: boolean;
  supplier: SupplierIdentity;
  transaction?: SupplierTransaction | null;
  onClose: () => void;
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
});

export const SupplierTransactionFormDialog: React.FC<Props> = ({ open, supplier, transaction, onClose }) => {
  const mutations = useSupplierTransactionMutations();
  const mutation = transaction ? mutations.update : mutations.create;
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!transaction) { setForm(emptyForm()); return; }
    setForm({ type: transaction.type, direction: transaction.direction, amount: transaction.amount, transactionDate: transaction.transactionDate, description: transaction.description, reference: transaction.reference ?? '', notes: transaction.notes ?? '', reason: '', accountPassword: '' });
  }, [transaction, open]);

  const set = (key: keyof ReturnType<typeof emptyForm>) => (event: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const input = { type: form.type, direction: form.type === 'SUPPLIER_ADJUSTMENT' ? (form.direction || undefined) as SupplierTransactionDirection|undefined : undefined, amount: canonicalMoneyInput(form.amount), transactionDate: form.transactionDate, description: form.description, reference: form.reference || null, notes: form.notes || null };
      if (transaction) await mutations.update.mutateAsync({ id: transaction.id, input: { ...input, reason: form.reason, accountPassword: form.accountPassword } });
      else await mutations.create.mutateAsync({ supplierId: supplier.id, input });
      onClose();
    } catch (error) { toast.error(normalizeFinancialError(error).message); }
  };

  return <Modal isOpen={open} onClose={onClose} title={transaction ? 'Edit Transaction / تعديل حركة' : businessLabels.supplier.addTransaction} maxWidth="max-w-2xl">
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-md bg-slate-50 p-3"><p className="user-text font-semibold" dir="auto">{supplier.name}</p><p className="text-sm text-slate-500">{supplier.phone}</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Type / النوع<select value={form.type} onChange={set('type')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal">{Object.entries(supplierTransactionTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {form.type === 'SUPPLIER_ADJUSTMENT' && <label className="text-sm font-semibold">Direction / الاتجاه<select required value={form.direction} onChange={set('direction')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal"><option value="">Select / اختر</option>{Object.entries(supplierDirectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <Field label={businessLabels.supplier.amount} required inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: sanitizeMoneyInput(event.target.value) }))} />
        <Field label={businessLabels.supplier.date} required type="date" value={form.transactionDate} onChange={set('transactionDate')} />
      </div>
      <Field label={businessLabels.supplier.description} required value={form.description} onChange={set('description')} />
      <div className="grid gap-4 sm:grid-cols-2"><Field label={businessLabels.supplier.reference} value={form.reference} onChange={set('reference')} /><Field label={businessLabels.supplier.notes} value={form.notes} onChange={set('notes')} /></div>
      {transaction && <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2"><Field label={businessLabels.supplier.reason} required value={form.reason} onChange={set('reason')} /><Field label={businessLabels.supplier.accountPassword} required type="password" value={form.accountPassword} onChange={set('accountPassword')} /></div>}
      <button disabled={mutation.isPending} className="w-full rounded-md bg-emerald-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Saving... / جارٍ الحفظ' : businessLabels.common.save}</button>
    </form>
  </Modal>;
};

const Field: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, ...props }) => <label className="block text-sm font-semibold text-slate-700">{label}<input {...props} dir="auto" className="user-text-input mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" /></label>;
