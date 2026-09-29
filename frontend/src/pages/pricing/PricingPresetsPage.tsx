import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Calculator, Plus } from 'lucide-react';
import { Pagination } from '../../components/ui/Pagination';
import { useAuth } from '../../hooks/useAuth';
import { LabelSecretPricingSettings } from '../../features/pricing/components/LabelSecretPricingSettings';
import { PricingPresetActionDialog } from '../../features/pricing/components/PricingPresetActionDialog';
import { PricingPresetFormDialog } from '../../features/pricing/components/PricingPresetFormDialog';
import { PricingPresetsTable } from '../../features/pricing/components/PricingPresetsTable';
import {
  useArchivePricingPreset, useClearLabelSecretPricingPreset, usePricingPresets,
  useRestorePricingPreset, useSetDefaultPricingPreset, useSetLabelSecretPricingPreset,
} from '../../features/pricing/hooks/usePricingPresets';
import { PricingPreset, PricingPresetAction, PricingPresetFilters } from '../../features/pricing/types/pricing.types';
import { pricingLabels } from '../../features/pricing/utils/pricing-labels';

export const PricingPresetsPage: React.FC = () => {
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const [filters, setFilters] = useState<PricingPresetFilters>({ isActive: true, page: 1, pageSize: 25 });
  const [form, setForm] = useState<{open:boolean;preset:PricingPreset|null}>({ open: false, preset: null });
  const [action, setAction] = useState<{preset:PricingPreset;type:PricingPresetAction}|null>(null);
  const query = usePricingPresets(filters);
  const archive = useArchivePricingPreset();
  const restore = useRestorePricingPreset();
  const setDefault = useSetDefaultPricingPreset();
  const setLabelSecret = useSetLabelSecretPricingPreset();
  const clearLabelSecret = useClearLabelSecretPricingPreset();

  const execute = (input: {reason?:string;accountPassword:string}) => {
    if (!action) return;
    const onSuccess = () => { toast.success('Pricing preset updated / تم تحديث صيغة التسعير'); setAction(null); };
    const onError = () => toast.error('Unable to update pricing preset');
    if (action.type === 'labelSecret') return setLabelSecret.mutate({ id: action.preset.id, input: { accountPassword: input.accountPassword } }, { onSuccess, onError });
    if (action.type === 'clearLabelSecret') return clearLabelSecret.mutate({ id: action.preset.id, input: { accountPassword: input.accountPassword } }, { onSuccess, onError });
    const protectedInput = { reason: input.reason ?? '', accountPassword: input.accountPassword };
    const mutation = { archive, restore, default: setDefault }[action.type];
    mutation.mutate({ id: action.preset.id, input: protectedInput }, { onSuccess, onError });
  };

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="flex items-center gap-3"><Calculator className="h-7 w-7 text-emerald-600" /><h1 className="text-2xl font-bold">{pricingLabels.pricingPresets}</h1></div><p className="mt-1 text-sm text-slate-500">Reusable product pricing formulas / صيغ قابلة لإعادة الاستخدام لتسعير المنتجات</p></div>
      {admin && <button onClick={() => setForm({ open: true, preset: null })} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />{pricingLabels.createPreset}</button>}
    </header>
    {admin && <LabelSecretPricingSettings />}
    <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
      <input dir="auto" value={filters.search ?? ''} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value, page: 1 }))} placeholder="Search name or type / بحث بالاسم أو النوع" className="user-text-input rounded-lg border border-slate-300 px-3 py-2" />
      <select value={filters.isActive === undefined ? 'all' : String(filters.isActive)} onChange={(event) => setFilters((current) => ({ ...current, isActive: event.target.value === 'all' ? undefined : event.target.value === 'true', page: 1 }))} className="rounded-lg border border-slate-300 px-3 py-2"><option value="true">Active / نشطة</option><option value="false">Archived / مؤرشفة</option><option value="all">All / الكل</option></select>
      <select value={`${filters.sortBy ?? 'name'}:${filters.sortOrder ?? 'asc'}`} onChange={(event) => { const [sortBy, sortOrder] = event.target.value.split(':'); setFilters((current) => ({ ...current, sortBy: sortBy as PricingPresetFilters['sortBy'], sortOrder: sortOrder as PricingPresetFilters['sortOrder'] })); }} className="rounded-lg border border-slate-300 px-3 py-2"><option value="name:asc">Name A–Z</option><option value="updatedAt:desc">Recently updated</option></select>
    </section>
    {query.isLoading ? <div className="p-12 text-center text-slate-500">Loading / جارٍ التحميل…</div> : query.isError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Unable to load pricing presets / تعذر تحميل صيغ التسعير</div> : query.data?.items.length ? <><PricingPresetsTable items={query.data.items} admin={admin} onEdit={(preset) => setForm({ open: true, preset })} onAction={(preset, type) => setAction({ preset, type })} /><Pagination currentPage={filters.page ?? 1} totalPages={query.data.pagination.totalPages} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} /></> : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center"><Calculator className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-medium">{pricingLabels.noPresets}</p></div>}
    <PricingPresetFormDialog open={form.open} preset={form.preset} onClose={() => setForm({ open: false, preset: null })} />
    <PricingPresetActionDialog preset={action?.preset ?? null} action={action?.type ?? 'archive'} pending={archive.isPending || restore.isPending || setDefault.isPending || setLabelSecret.isPending || clearLabelSecret.isPending} onClose={() => setAction(null)} onConfirm={execute} />
  </div>;
};
