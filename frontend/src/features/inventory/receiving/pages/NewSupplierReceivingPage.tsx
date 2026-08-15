import { ArrowLeft, PackagePlus } from 'lucide-react';
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SupplierReceivingForm, receivingPrefillFromRouteState } from '../components/SupplierReceivingForm';

export const NewSupplierReceivingPage: React.FC = () => {
  const location = useLocation();
  // Scanner hand-off. Absent for a direct visit, which starts an empty form.
  const prefill = receivingPrefillFromRouteState(location.state);

  return <div className="space-y-5">
    <header><Link to="/inventory/receiving" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><ArrowLeft className="h-4 w-4" />Receiving history / سجل الإدخال</Link><div className="flex items-center gap-2"><PackagePlus className="h-7 w-7 text-emerald-700" /><h1 className="text-2xl font-bold">Receive Stock / إدخال إلى المخزون</h1></div><p className="mt-1 text-sm text-slate-500">Record physical stock received. This does not create supplier debt or payment / سجّل المخزون المستلم فعليًا دون إنشاء دين أو دفعة للمورد</p></header>
    {prefill && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Scanned product added to the first line / تمت إضافة المنتج الممسوح إلى السطر الأول</p>}
    <SupplierReceivingForm prefill={prefill} />
  </div>;
};
