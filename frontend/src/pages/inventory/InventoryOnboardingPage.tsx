import React, { FormEvent, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ClipboardCheck, Search, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Pagination } from '../../components/ui/Pagination';
import { InventoryOnboardingOutcome, InventoryOnboardingPreview } from '../../features/inventory/components/InventoryOnboardingPreview';
import { InventoryOnboardingTable } from '../../features/inventory/components/InventoryOnboardingTable';
import { useBatchOnboarding, usePendingOnboarding } from '../../features/inventory/hooks/useInventory';
import type {
  BatchOnboardingDryRunResult,
  BatchOnboardingWriteResult,
  BatchOpeningCountItem,
  OnboardingWorklistItem,
} from '../../features/inventory/types/inventory.types';
import {
  addOnboardingSelection,
  buildOnboardingItems,
  onboardingItemsSignature,
  onboardingPreviewMatches,
  onboardingSelectionCounts,
  OnboardingInputIssue,
  OnboardingSelection,
  removeOnboardingSelection,
  setAllOnboardingCountsToZero,
  updateOnboardingSelection,
  validateOnboardingSelection,
} from '../../features/inventory/utils/onboarding-batch';
import { useAuth } from '../../hooks/useAuth';

interface PreviewSnapshot {
  result: BatchOnboardingDryRunResult;
  items: BatchOpeningCountItem[];
  signature: string;
}

export const InventoryOnboardingPage: React.FC = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selection, setSelection] = useState<OnboardingSelection>(() => new Map());
  const [selectionMessage, setSelectionMessage] = useState('');
  const [issues, setIssues] = useState<OnboardingInputIssue[]>([]);
  const [preview, setPreview] = useState<PreviewSnapshot | null>(null);
  const [serverError, setServerError] = useState('');
  const [writeResult, setWriteResult] = useState<BatchOnboardingWriteResult | null>(null);
  const [resultNames, setResultNames] = useState<Map<string, string>>(() => new Map());
  const worklist = usePendingOnboarding({ search, includeArchived, page, pageSize });
  const previewMutation = useBatchOnboarding();
  const writeMutation = useBatchOnboarding();
  const counts = onboardingSelectionCounts(selection);
  const invalidIds = new Set(issues.map((issue) => issue.productId));
  const currentPreview = preview && onboardingPreviewMatches(selection, preview.signature) ? preview : null;

  const invalidatePreview = () => {
    setPreview(null);
    setServerError('');
    setWriteResult(null);
  };

  const changeSelection = (next: OnboardingSelection) => {
    setSelection(next);
    setIssues([]);
    setSelectionMessage('');
    invalidatePreview();
  };

  const toggle = (product: OnboardingWorklistItem, selected: boolean) => {
    if (!selected) {
      changeSelection(removeOnboardingSelection(selection, product.productId));
      return;
    }
    const next = addOnboardingSelection(selection, product);
    if (next.capped) {
      setSelectionMessage('A batch can contain at most 100 products / الحد الأقصى للدفعة هو 100 منتج');
      return;
    }
    changeSelection(next.selection);
  };

  const previewBatch = async () => {
    const nextIssues = validateOnboardingSelection(selection);
    setIssues(nextIssues);
    setServerError('');
    setWriteResult(null);
    if (nextIssues.length || selection.size === 0) return;
    const items = buildOnboardingItems(selection);
    try {
      const result = await previewMutation.mutateAsync({ dryRun: true, items });
      if (!result.dryRun) throw new Error('Expected a dry-run response');
      setPreview({ result, items, signature: onboardingItemsSignature(items) });
    } catch (error) {
      setPreview(null);
      setServerError(messageFrom(error, 'Preview failed / فشلت المعاينة'));
    }
  };

  const submitBatch = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentPreview) return;
    const currentSignature = onboardingItemsSignature(buildOnboardingItems(selection));
    if (currentSignature !== currentPreview.signature) {
      invalidatePreview();
      setServerError('The batch changed. Preview it again / تغيرت الدفعة. أعد المعاينة');
      return;
    }
    setServerError('');
    try {
      const result = await writeMutation.mutateAsync({
        dryRun: false, items: currentPreview.items,
      });
      if (result.dryRun) throw new Error('Expected a write response');
      setResultNames(new Map([...selection].map(([id, entry]) => [id, entry.product.name])));
      setWriteResult(result);
      setSelection(new Map());
      setIssues([]);
      setPreview(null);
      setSelectionMessage('');
    } catch (error) {
      setServerError(messageFrom(error, 'Batch onboarding failed / فشل إدراج الدفعة'));
    }
  };

  if (user?.role !== 'ADMIN') return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Administrators only / للمسؤولين فقط</div>;

  const nameFor = (productId: string) => selection.get(productId)?.product.name ?? resultNames.get(productId) ?? productId;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><Link to="/inventory" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><ArrowLeft className="h-4 w-4" />Inventory / المخزون</Link><div className="flex items-center gap-2"><ClipboardCheck className="h-7 w-7 text-emerald-700" /><h1 className="text-2xl font-bold">Inventory Onboarding / إدراج المنتجات في المخزون</h1></div><p className="mt-1 text-sm text-slate-500">Physically count each selected product before previewing / عدّ كل منتج محدد فعليًا قبل المعاينة</p></div></header>

    {writeResult && <InventoryOnboardingOutcome result={writeResult} nameFor={nameFor} />}

    <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_180px_180px]"><label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Search onboarding products / بحث منتجات الإدراج" dir="auto" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Name, SKU, barcode, model or brand / الاسم أو الرمز أو الباركود" className="user-text-input w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3" /></label><select aria-label="Onboarding filter / عامل تصفية الإدراج" className="rounded-lg border border-slate-300 px-3 py-2" value="never"><option value="never">Never onboarded / لم تُدرج</option></select><label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"><input type="checkbox" checked={includeArchived} onChange={(event) => { setIncludeArchived(event.target.checked); setPage(1); }} />Include archived / تضمين المؤرشف</label></section>

    <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><h2 className="font-bold">Pending products / المنتجات المعلّقة</h2><p className="text-xs text-slate-500">{worklist.data?.pagination.totalItems ?? 0} total / الإجمالي</p></div><label className="text-sm">Rows / الصفوف <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5"><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label></div>
      {worklist.isError ? <p role="alert" className="p-8 text-center text-red-700">Unable to load onboarding products / تعذر تحميل منتجات الإدراج</p> : <InventoryOnboardingTable items={worklist.data?.items ?? []} selection={selection} invalidProductIds={invalidIds} loading={worklist.isLoading} onToggle={toggle} onCountChange={(id, count) => changeSelection(updateOnboardingSelection(selection, id, { count }))} onNoteChange={(id, note) => changeSelection(updateOnboardingSelection(selection, id, { note }))} onRemove={(id) => changeSelection(removeOnboardingSelection(selection, id))} />}
      <Pagination currentPage={page} totalPages={worklist.data?.pagination.totalPages ?? 1} onPageChange={setPage} />
    </section>

    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold tabular-nums">{counts.selected} selected / محدد · {counts.entered} counts entered / جرد مُدخل · {counts.incomplete} incomplete / غير مكتمل</p><div className="flex flex-wrap gap-2"><button type="button" disabled={!selection.size} onClick={() => changeSelection(setAllOnboardingCountsToZero(selection))} className="rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-40">Set all selected to 0 / تعيين المحدد إلى 0</button><button type="button" disabled={!selection.size || previewMutation.isPending} onClick={previewBatch} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{previewMutation.isPending ? 'Previewing… / جارٍ العرض' : 'Preview batch / معاينة الدفعة'}</button></div></div>
      {selectionMessage && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{selectionMessage}</p>}
      {selection.size > 0 && <div className="flex flex-wrap gap-2">{[...selection].map(([id, entry]) => <button key={id} type="button" onClick={() => changeSelection(removeOnboardingSelection(selection, id))} className="user-text inline-flex max-w-64 items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs" dir="auto"><span className="truncate">{entry.product.name}</span><X className="h-3 w-3 shrink-0" /></button>)}</div>}
      {issues.length > 0 && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3"><p className="font-semibold text-red-800">Fix invalid or blank counts before preview / صحح الجرد غير الصالح أو الفارغ قبل المعاينة</p><ul className="mt-2 space-y-1 text-sm text-red-700">{issues.map((issue) => <li key={issue.productId}><a href={`#opening-count-${issue.productId}`} className="underline" dir="auto">{issue.name}</a> — {issue.message}</li>)}</ul></div>}
    </section>

    {currentPreview && <InventoryOnboardingPreview result={currentPreview.result} nameFor={nameFor} />}
    {serverError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" dir="auto">{serverError}</p>}

    {currentPreview && <form onSubmit={submitBatch} className="space-y-4 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Confirm batch / تأكيد الدفعة</h2></div><button disabled={writeMutation.isPending || currentPreview.result.valid.length === 0} className="rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white disabled:opacity-40">{writeMutation.isPending ? 'Submitting… / جارٍ الحفظ' : `Submit ${currentPreview.result.valid.length} products / حفظ ${currentPreview.result.valid.length} منتجات`}</button></form>}
  </div>;
};

export function messageFrom(error: unknown, fallback: string): string {
  return axios.isAxiosError(error) ? error.response?.data?.error?.message ?? fallback : fallback;
}
