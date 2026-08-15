import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Pagination } from '../../components/ui/Pagination';
import { SupplierActionDialog } from '../../features/suppliers/components/SupplierActionDialog';
import { SupplierFormDialog } from '../../features/suppliers/components/SupplierFormDialog';
import { SupplierPurchaseFormDialog } from '../../features/suppliers/components/SupplierPurchaseFormDialog';
import { SupplierStatusBadge } from '../../features/suppliers/components/SupplierStatusBadge';
import { SupplierSummaryCards } from '../../features/suppliers/components/SupplierSummaryCards';
import { SupplierTransactionFormDialog, type SupplierTransactionPrefill } from '../../features/suppliers/components/SupplierTransactionFormDialog';
import { SupplierTransactionTable } from '../../features/suppliers/components/SupplierTransactionTable';
import { useSupplierMutations, useSupplierTransactionMutations } from '../../features/suppliers/hooks/useSupplierMutations';
import { useSupplier, useSupplierAudit, useSupplierTransactions } from '../../features/suppliers/hooks/useSuppliers';
import { ProtectedActionInput, SupplierTransaction } from '../../features/suppliers/types/supplier.types';
import { useAuth } from '../../hooks/useAuth';
import { SupplierReceivingHistory } from '../../features/inventory/receiving/components/SupplierReceivingHistory';

type Action = { kind: 'archive'|'restore'|'delete' } | { kind: 'removeTransaction'|'restoreTransaction'; transaction: SupplierTransaction } | null;

export const SupplierProfilePage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefill = (location.state as { prefillTransaction?: SupplierTransactionPrefill } | null)?.prefillTransaction ?? null;
  const { user } = useAuth();
  const canMutate = user?.role === 'ADMIN';
  const supplier = useSupplier(id);
  const [page, setPage] = useState(1);
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const transactions = useSupplierTransactions(id, includeRemoved, page);
  const audit = useSupplierAudit(id, canMutate);
  const supplierMutations = useSupplierMutations();
  const transactionMutations = useSupplierTransactionMutations();
  const [editSupplier, setEditSupplier] = useState(false);
  const [transactionForm, setTransactionForm] = useState<{ open: boolean; transaction: SupplierTransaction | null }>({ open: false, transaction: null });
  const [transactionPrefill, setTransactionPrefill] = useState<SupplierTransactionPrefill | null>(routePrefill);
  const [purchaseForm, setPurchaseForm] = useState(false);
  const [action, setAction] = useState<Action>(null);

  useEffect(() => {
    if (!routePrefill || supplier.isLoading) return;
    if (canMutate && supplier.data?.isActive) {
      setTransactionPrefill(routePrefill);
      setTransactionForm({ open: true, transaction: null });
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [canMutate, location.pathname, navigate, routePrefill, supplier.data?.isActive, supplier.isLoading]);

  if (supplier.isLoading) return <PageState text="Loading supplier... / جارٍ تحميل المورّد" />;
  if (supplier.isError || !supplier.data) return <PageState error text="Supplier not found / المورّد غير موجود" />;
  const item = supplier.data;
  const runAction = async (input: ProtectedActionInput) => {
    if (!action) return;
    if (action.kind === 'archive') await supplierMutations.archive.mutateAsync({ id, input });
    if (action.kind === 'restore') await supplierMutations.restore.mutateAsync({ id, input });
    if (action.kind === 'delete') { await supplierMutations.remove.mutateAsync({ id, input }); navigate('/suppliers'); }
    if (action.kind === 'removeTransaction') await transactionMutations.remove.mutateAsync({ id: action.transaction.id, input });
    if (action.kind === 'restoreTransaction') await transactionMutations.restore.mutateAsync({ id: action.transaction.id, input });
  };

  return <div className="space-y-5">
    <Link to="/suppliers" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Suppliers / المورّدين</Link>
    <header className="flex flex-col justify-between gap-4 rounded-lg border bg-white p-5 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-3"><h1 className="user-text text-2xl font-bold" dir="auto">{item.name}</h1><SupplierStatusBadge active={item.isActive} /></div><p className="mt-1 text-slate-600">{item.phone}{item.secondaryPhone ? ` · ${item.secondaryPhone}` : ''}</p>{item.companyName && <p className="user-text text-sm text-slate-500" dir="auto">{item.companyName}</p>}</div>{canMutate && <div className="flex flex-wrap gap-2"><button onClick={() => setEditSupplier(true)} className="rounded-md border px-3 py-2 text-sm font-semibold">Edit / تعديل</button>{item.isActive ? <button onClick={() => setAction({ kind: 'archive' })} className="rounded-md border px-3 py-2 text-sm font-semibold">Archive / أرشفة</button> : <button onClick={() => setAction({ kind: 'restore' })} className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700">Restore / استعادة</button>}<button onClick={() => setAction({ kind: 'delete' })} className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Remove / إزالة</button></div>}</header>
    {item.summary && <SupplierSummaryCards summary={item.summary} />}
    <SupplierReceivingHistory supplierId={id} />
    <section className="grid gap-4 lg:grid-cols-3"><div className="rounded-lg border bg-white p-4 lg:col-span-2"><h2 className="font-bold">Supplier information / معلومات المورّد</h2><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><Info label="Email / البريد" value={item.email} /><Info label="Company / الشركة" value={item.companyName} /><Info label="Notes / ملاحظات" value={item.notes} auto /></dl></div><div className="rounded-lg border bg-white p-4"><h2 className="font-bold">Record / السجل</h2><p className="mt-3 text-sm text-slate-600">Created by {item.createdBy?.fullName ?? 'Unknown'}</p><p className="text-sm text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>{item.archivedReason && <p className="user-text mt-3 rounded bg-amber-50 p-2 text-sm text-amber-800" dir="auto">{item.archivedReason}</p>}</div></section>
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Transactions / الحركات</h2><div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeRemoved} onChange={(event) => { setIncludeRemoved(event.target.checked); setPage(1); }} />Include removed / إظهار المحذوف</label>{canMutate && item.isActive && <><button onClick={() => setPurchaseForm(true)} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Add Purchase / إضافة فاتورة</button><button onClick={() => setTransactionForm({ open: true, transaction: null })} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><Plus className="h-4 w-4" />Add Transaction / إضافة حركة</button></>}</div></div>{transactions.isLoading ? <PageState text="Loading transactions... / جارٍ تحميل الحركات" /> : transactions.isError ? <PageState error text="Unable to load transactions / تعذر تحميل الحركات" /> : transactions.data?.items.length ? <><SupplierTransactionTable items={transactions.data.items} canMutate={canMutate} showSupplier={false} onEdit={(transaction) => setTransactionForm({ open: true, transaction })} onRemove={(transaction) => setAction({ kind: 'removeTransaction', transaction })} onRestore={(transaction) => setAction({ kind: 'restoreTransaction', transaction })} /><Pagination currentPage={page} totalPages={transactions.data.pagination.totalPages} onPageChange={setPage} /></> : <PageState text="No transactions yet / لا توجد حركات بعد" />}</section>
    {canMutate && <section className="rounded-lg border bg-white p-4"><h2 className="font-bold">Audit history / سجل التدقيق</h2>{audit.isLoading ? <p className="mt-3 text-sm text-slate-500">Loading... / جارٍ التحميل</p> : audit.data?.items.length ? <div className="mt-3 divide-y">{audit.data.items.map((entry) => <div key={entry.id} className="py-3 text-sm"><div className="flex justify-between gap-3"><strong>{entry.action}</strong><span className="text-xs text-slate-500">{new Date(entry.changedAt).toLocaleString()}</span></div><p className="user-text mt-1 text-slate-600" dir="auto">{entry.reason}</p><p className="text-xs text-slate-500">{entry.changedByName}</p></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No audit entries / لا يوجد سجل</p>}</section>}
    <SupplierFormDialog open={editSupplier} supplier={item} onClose={() => setEditSupplier(false)} />
    <SupplierTransactionFormDialog open={transactionForm.open} supplier={item} transaction={transactionForm.transaction} prefill={transactionForm.transaction ? null : transactionPrefill} onClose={() => { setTransactionForm({ open: false, transaction: null }); setTransactionPrefill(null); }} />
    <SupplierPurchaseFormDialog open={purchaseForm} supplier={item} onClose={() => setPurchaseForm(false)} />
    <SupplierActionDialog open={Boolean(action)} title={actionTitle(action)} confirmLabel="Confirm / تأكيد" onClose={() => setAction(null)} onConfirm={runAction} />
  </div>;
};

const Info: React.FC<{ label: string; value: string|null; auto?: boolean }> = ({ label, value, auto }) => <div><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="user-text mt-1 whitespace-pre-wrap text-slate-800" dir={auto ? 'auto' : undefined}>{value || '—'}</dd></div>;
const PageState: React.FC<{ text: string; error?: boolean }> = ({ text, error }) => <div role={error ? 'alert' : undefined} className={`rounded-lg border p-8 text-center text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-500'}`}>{text}</div>;
function actionTitle(action: Action) { if (!action) return ''; const labels: Record<NonNullable<Action>['kind'], string> = { archive: 'Archive Supplier / أرشفة المورّد', restore: 'Restore Supplier / استعادة المورّد', delete: 'Remove Supplier / إزالة المورّد', removeTransaction: 'Remove Transaction / حذف الحركة', restoreTransaction: 'Restore Transaction / استعادة الحركة' }; return labels[action.kind]; }
