import React, { FormEvent, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui/Modal';
import { useCreateServiceJob } from '../hooks/useServiceJobs';
import { CreateServiceJobInput, ServiceRequestType, WarrantyStatus } from '../types/service.types';
import { REQUEST_TYPE_LABELS, WARRANTY_LABELS } from '../utils/service-labels';
import { CustomerPicker } from '../../customers/components/CustomerPicker';
import { ProductPicker, ProductSelection } from '../../products/components/ProductPicker';
import { businessLabels } from '../../../shared/labels/business-labels';

const emptyProduct: ProductSelection = { productId: null, manualProductName: '', manualProductModel: '', manualProductBrand: '', manualProductNotes: '' };
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; };

export const CreateServiceJobDialog: React.FC<{ isOpen: boolean; onClose: () => void; customerId?: string }> = ({ isOpen, onClose, customerId }) => {
  const create = useCreateServiceJob();
  const [selectedCustomer, setSelectedCustomer] = useState(customerId ?? '');
  const [product, setProduct] = useState<ProductSelection>(emptyProduct);
  const [form, setForm] = useState({ requestType: 'WORKSHOP_DROP_OFF' as ServiceRequestType, issueDescription: '', requestedPartName: '', warrantyStatus: 'UNKNOWN' as WarrantyStatus, estimatedPrice: '', serviceCreatedDate: today(), homeVisitScheduledDate: '', notes: '' });
  const [error, setError] = useState('');
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!selectedCustomer) { setError('Select a customer / اختر زبوناً.'); return; }
    if (!product.productId && !product.manualProductName.trim()) { setError('Product name is required / اسم المنتج مطلوب.'); return; }
    const input: CreateServiceJobInput = { customerId: selectedCustomer, ...product, requestType: form.requestType, issueDescription: form.issueDescription, requestedPartName: form.requestedPartName || null, warrantyStatus: form.warrantyStatus, estimatedPrice: form.estimatedPrice || null, serviceCreatedDate: form.serviceCreatedDate, homeVisitScheduledDate: form.homeVisitScheduledDate || null, notes: form.notes || null };
    create.mutate(input, { onSuccess: () => { toast.success('Service job created'); setProduct(emptyProduct); setForm({ requestType: 'WORKSHOP_DROP_OFF', issueDescription: '', requestedPartName: '', warrantyStatus: 'UNKNOWN', estimatedPrice: '', serviceCreatedDate: today(), homeVisitScheduledDate: '', notes: '' }); onClose(); }, onError: (reason) => setError(apiError(reason)) });
  };
  return <Modal isOpen={isOpen} onClose={onClose} title={businessLabels.service.newJob} maxWidth="max-w-3xl"><form onSubmit={submit} className="space-y-5">
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <CustomerPicker value={selectedCustomer} onChange={setSelectedCustomer} locked={Boolean(customerId)} />
    <ProductPicker value={product} onChange={setProduct} />
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">{businessLabels.service.requestType}<select value={form.requestType} onChange={(e) => update('requestType', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">{Object.entries(REQUEST_TYPE_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-medium text-slate-700">{businessLabels.service.warranty}<select value={form.warrantyStatus} onChange={(e) => update('warrantyStatus', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">{Object.entries(WARRANTY_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="sm:col-span-2 text-sm font-medium text-slate-700">{businessLabels.service.issueDescription} *<textarea required dir="auto" value={form.issueDescription} onChange={(e) => update('issueDescription', e.target.value)} className="user-text-input mt-1 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      {form.requestType === 'PART_REPLACEMENT' && <label className="text-sm font-medium text-slate-700">{businessLabels.service.requestedPart} *<input required dir="auto" value={form.requestedPartName} onChange={(e) => update('requestedPartName', e.target.value)} className="user-text-input mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>}
      <label className="text-sm font-medium text-slate-700">Created Date / تاريخ الاستلام<input type="date" required value={form.serviceCreatedDate} onChange={(e) => update('serviceCreatedDate', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
      {form.requestType === 'ON_CALL' && <label className="text-sm font-medium text-slate-700">Home Visit Date / تاريخ الزيارة<input type="date" value={form.homeVisitScheduledDate} onChange={(e) => update('homeVisitScheduledDate', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>}
      <label className="text-sm font-medium text-slate-700">Estimated Price / السعر التقديري<input inputMode="decimal" value={form.estimatedPrice} onChange={(e) => update('estimatedPrice', e.target.value)} placeholder="0.00" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
      <label className="sm:col-span-2 text-sm font-medium text-slate-700">{businessLabels.common.notes}<textarea dir="auto" value={form.notes} onChange={(e) => update('notes', e.target.value)} className="user-text-input mt-1 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
    </div>
    <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2">{businessLabels.common.cancel}</button><button disabled={create.isPending} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{create.isPending ? 'Saving... / جارٍ الحفظ...' : 'Create Service Job / إنشاء طلب صيانة'}</button></div>
  </form></Modal>;
};

function apiError(error: unknown) { return axios.isAxiosError(error) ? error.response?.data?.error?.message ?? 'Request failed' : 'Request failed'; }
