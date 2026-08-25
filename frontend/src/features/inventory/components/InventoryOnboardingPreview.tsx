import React from 'react';
import type { BatchOnboardingDryRunResult, BatchOnboardingSkipReason, BatchOnboardingWriteResult } from '../types/inventory.types';

interface Props {
  result: BatchOnboardingDryRunResult;
  nameFor: (productId: string) => string;
}

const skipLabel: Record<BatchOnboardingSkipReason, string> = {
  ALREADY_ONBOARDED: 'Already onboarded — skipped, never overwritten / مُدرج سابقًا — تم التخطي دون استبدال',
  PRODUCT_ARCHIVED: 'Archived — skipped / مؤرشف — تم التخطي',
  PRODUCT_NOT_FOUND: 'Missing — skipped / غير موجود — تم التخطي',
};

export const InventoryOnboardingPreview: React.FC<Props> = ({ result, nameFor }) => {
  const grouped = result.skipped.reduce<Partial<Record<BatchOnboardingSkipReason, typeof result.skipped>>>((all, item) => {
    (all[item.reason] ??= []).push(item);
    return all;
  }, {});
  return <section aria-label="Batch preview / معاينة الدفعة" className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
    <div><h2 className="font-bold text-blue-950">Authoritative preview / المعاينة المعتمدة</h2><p className="text-sm text-blue-800">The server decides which rows can be written / الخادم يحدد الصفوف القابلة للحفظ</p></div>
    <details open className="rounded-lg border border-emerald-200 bg-white p-3"><summary className="cursor-pointer font-semibold text-emerald-800">{result.counts.valid} will be onboarded / سيتم إدراج {result.counts.valid}</summary><ul className="mt-2 space-y-1 text-sm">{result.valid.map((item) => <li key={item.productId} dir="auto">{nameFor(item.productId)} — {item.openingCount}</li>)}</ul></details>
    {(Object.keys(grouped) as BatchOnboardingSkipReason[]).map((reason) => <div key={reason} className="rounded-lg border border-amber-200 bg-white p-3"><p className="font-semibold text-amber-900">{grouped[reason]?.length ?? 0} · {skipLabel[reason]}</p><ul className="mt-2 space-y-1 text-sm text-slate-700">{grouped[reason]?.map((item) => <li key={item.productId} dir="auto">{nameFor(item.productId)}</li>)}</ul></div>)}
  </section>;
};

export const InventoryOnboardingOutcome: React.FC<{
  result: BatchOnboardingWriteResult;
  nameFor: (productId: string) => string;
}> = ({ result, nameFor }) => <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
  <h2 className="font-bold text-emerald-900">Batch recorded / تم تسجيل الدفعة</h2>
  <p className="mt-1 text-sm text-emerald-800"><strong>{result.counts.written}</strong> written / تم حفظها · <strong>{result.counts.skipped}</strong> skipped / تم تخطيها</p>
  {result.skipped.length > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3"><p className="text-sm font-semibold text-amber-900">Skipped rows were not onboarded / الصفوف المتخطاة لم تُدرج</p><ul className="mt-2 space-y-1 text-sm">{result.skipped.map((item) => <li key={item.productId} dir="auto">{nameFor(item.productId)} — {item.reason}</li>)}</ul></div>}
</section>;
