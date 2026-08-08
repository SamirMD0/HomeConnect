import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { Pagination } from '../../components/ui/Pagination';
import { SupplierActionDialog } from '../../features/suppliers/components/SupplierActionDialog';
import { SupplierLedgerFilters } from '../../features/suppliers/components/SupplierLedgerFilters';
import { SupplierSummaryCards } from '../../features/suppliers/components/SupplierSummaryCards';
import { SupplierTransactionFormDialog } from '../../features/suppliers/components/SupplierTransactionFormDialog';
import { SupplierTransactionTable } from '../../features/suppliers/components/SupplierTransactionTable';
import { useSupplierLedger } from '../../features/suppliers/hooks/useSupplierLedger';
import { useSupplierTransactionMutations } from '../../features/suppliers/hooks/useSupplierMutations';
import { useSuppliers } from '../../features/suppliers/hooks/useSuppliers';
import { ProtectedActionInput, SupplierLedgerFilters as FilterValues, SupplierTransaction } from '../../features/suppliers/types/supplier.types';
import { defaultSupplierLedgerFilters, resetSupplierLedgerFilters } from '../../features/suppliers/utils/supplier-query';
import { useAuth } from '../../hooks/useAuth';

type Action = { kind: 'remove'|'restore'; transaction: SupplierTransaction } | null;

export const SupplierLedgerPage: React.FC = () => {
  const { user } = useAuth();
  const canMutate = user?.role === 'ADMIN';
  const [filters, setFilters] = useState<FilterValues>({ ...defaultSupplierLedgerFilters });
  const ledger = useSupplierLedger(filters);
  const suppliers = useSuppliers({ isActive: true, page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' });
  const mutations = useSupplierTransactionMutations();
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [form, setForm] = useState<{ open: boolean; transaction: SupplierTransaction | null }>({ open: false, transaction: null });
  const [action, setAction] = useState<Action>(null);
  const activeSuppliers = suppliers.data?.items ?? [];
  const formSupplier = form.transaction?.supplier ?? activeSuppliers.find((supplier) => supplier.id === selectedSupplierId);
  const change = (changes: Partial<FilterValues>) => setFilters((current) => ({ ...current, ...changes }));
  const startAdd = () => { const id = selectedSupplierId || filters.supplierId || ''; setSelectedSupplierId(id); if (!id) { toast.error('Select a supplier first / اختر مورّداً أولاً'); return; } setForm({ open: true, transaction: null }); };
  const runAction = async (input: ProtectedActionInput) => { if (!action) return; if (action.kind === 'remove') await mutations.remove.mutateAsync({ id: action.transaction.id, input }); else await mutations.restore.mutateAsync({ id: action.transaction.id, input }); };

  return <div className="w-full space-y-5">
    <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h1 className="text-2xl font-bold">Supplier Ledger / دفتر حسابات المورّدين</h1><p className="mt-1 text-sm text-slate-500">Supplier debts, payments, credits, and adjustments / ديون ومدفوعات وأرصدة المورّدين</p></div>{canMutate && <div className="flex min-w-0 flex-col gap-2 sm:flex-row"><select value={selectedSupplierId} onChange={(event) => setSelectedSupplierId(event.target.value)} className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="">Select supplier / اختر المورّد</option>{activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} - {supplier.phone}</option>)}</select><button onClick={startAdd} className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white"><Plus className="h-4 w-4" />Add Transaction / إضافة حركة</button></div>}</header>
    {ledger.data && <SupplierSummaryCards summary={ledger.data.summary} />}
    <SupplierLedgerFilters filters={filters} suppliers={activeSuppliers} onChange={change} onClear={() => setFilters(resetSupplierLedgerFilters())} />
    {ledger.isLoading ? <State text="Loading supplier ledger... / جارٍ تحميل دفتر المورّدين" /> : ledger.isError ? <State error text="Unable to load supplier ledger / تعذر تحميل دفتر المورّدين" /> : ledger.data?.items.length ? <><SupplierTransactionTable items={ledger.data.items} canMutate={canMutate} onEdit={(transaction) => { setSelectedSupplierId(transaction.supplierId); setForm({ open: true, transaction }); }} onRemove={(transaction) => setAction({ kind: 'remove', transaction })} onRestore={(transaction) => setAction({ kind: 'restore', transaction })} /><Pagination currentPage={filters.page ?? 1} totalPages={ledger.data.pagination.totalPages} onPageChange={(page) => change({ page })} /></> : <State text="No supplier transactions match these filters / لا توجد حركات مورّدين مطابقة" />}
    {formSupplier && <SupplierTransactionFormDialog open={form.open} supplier={formSupplier} transaction={form.transaction} onClose={() => setForm({ open: false, transaction: null })} />}
    <SupplierActionDialog open={Boolean(action)} title={action?.kind === 'remove' ? 'Remove Transaction / حذف الحركة' : 'Restore Transaction / استعادة الحركة'} confirmLabel="Confirm / تأكيد" onClose={() => setAction(null)} onConfirm={runAction} />
  </div>;
};

const State: React.FC<{ text: string; error?: boolean }> = ({ text, error }) => <div role={error ? 'alert' : undefined} className={`rounded-lg border p-10 text-center ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-500'}`}>{text}</div>;
