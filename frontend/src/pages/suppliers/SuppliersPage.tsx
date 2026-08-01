import React, { useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { Pagination } from '../../components/ui/Pagination';
import { SupplierActionDialog } from '../../features/suppliers/components/SupplierActionDialog';
import { SupplierFormDialog } from '../../features/suppliers/components/SupplierFormDialog';
import { SupplierTable } from '../../features/suppliers/components/SupplierTable';
import { useSupplierMutations } from '../../features/suppliers/hooks/useSupplierMutations';
import { useSuppliers } from '../../features/suppliers/hooks/useSuppliers';
import { Supplier, SupplierFilters } from '../../features/suppliers/types/supplier.types';
import { useAuth } from '../../hooks/useAuth';

type SupplierAction = { kind: 'archive'|'restore'; supplier: Supplier } | null;

export const SuppliersPage: React.FC = () => {
  const { user } = useAuth();
  const canMutate = user?.role === 'ADMIN';
  const [filters, setFilters] = useState<SupplierFilters>({ page: 1, pageSize: 25, sortBy: 'name', sortOrder: 'asc' });
  const suppliers = useSuppliers(filters);
  const mutations = useSupplierMutations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [action, setAction] = useState<SupplierAction>(null);
  const update = (changes: Partial<SupplierFilters>) => setFilters((current) => ({ ...current, ...changes }));

  return <div className="space-y-5">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h1 className="text-2xl font-bold text-slate-900">Suppliers / المورّدين</h1><p className="mt-1 text-sm text-slate-500">Manage supplier contacts and balances / إدارة بيانات وأرصدة المورّدين</p></div>{canMutate && <button onClick={() => { setEditing(null); setFormOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700"><Plus className="h-4 w-4" />Add Supplier / إضافة مورّد</button>}</header>
    <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
      <label className="text-xs font-semibold text-slate-600">Search / بحث<input value={filters.search ?? ''} onChange={(event) => update({ search: event.target.value || undefined, page: 1 })} placeholder="Name, phone, company / الاسم، الهاتف، الشركة" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
      <label className="text-xs font-semibold text-slate-600">Status / الحالة<select value={filters.isActive === undefined ? '' : String(filters.isActive)} onChange={(event) => update({ isActive: event.target.value === '' ? undefined : event.target.value === 'true', page: 1 })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"><option value="">All / الكل</option><option value="true">Active / نشط</option><option value="false">Archived / مؤرشف</option></select></label>
      <label className="text-xs font-semibold text-slate-600">Sort / الترتيب<select value={`${filters.sortBy}:${filters.sortOrder}`} onChange={(event) => { const [sortBy, sortOrder] = event.target.value.split(':') as [SupplierFilters['sortBy'], SupplierFilters['sortOrder']]; update({ sortBy, sortOrder, page: 1 }); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"><option value="name:asc">Name A-Z / الاسم</option><option value="createdAt:desc">Newest / الأحدث</option><option value="balance:desc">Highest balance / أعلى رصيد</option></select></label>
    </section>
    {suppliers.isLoading ? <State text="Loading suppliers... / جارٍ تحميل المورّدين" /> : suppliers.isError ? <State error text="Unable to load suppliers / تعذر تحميل المورّدين" /> : suppliers.data?.items.length ? <><SupplierTable items={suppliers.data.items} canMutate={canMutate} onEdit={(supplier) => { setEditing(supplier); setFormOpen(true); }} onArchive={(supplier) => setAction({ kind: 'archive', supplier })} onRestore={(supplier) => setAction({ kind: 'restore', supplier })} /><Pagination currentPage={filters.page ?? 1} totalPages={suppliers.data.pagination.totalPages} onPageChange={(page) => update({ page })} /></> : <State text="No suppliers match these filters / لا يوجد مورّدون مطابقون" />}
    <SupplierFormDialog open={formOpen} supplier={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
    <SupplierActionDialog open={Boolean(action)} title={action?.kind === 'archive' ? 'Archive Supplier / أرشفة المورّد' : 'Restore Supplier / استعادة المورّد'} confirmLabel={action?.kind === 'archive' ? 'Archive / أرشفة' : 'Restore / استعادة'} onClose={() => setAction(null)} onConfirm={(input) => action?.kind === 'archive' ? mutations.archive.mutateAsync({ id: action.supplier.id, input }) : mutations.restore.mutateAsync({ id: action!.supplier.id, input })} />
  </div>;
};

const State: React.FC<{ text: string; error?: boolean }> = ({ text, error }) => <div role={error ? 'alert' : undefined} className={`rounded-lg border border-dashed p-12 text-center ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-300 bg-white text-slate-500'}`}><Truck className="mx-auto mb-3 h-7 w-7" />{text}</div>;
