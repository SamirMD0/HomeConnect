import axios from 'axios';
import { Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductPicker } from '../../../products/components/ProductPicker';
import { useSuppliers } from '../../../suppliers/hooks/useSuppliers';
import { useCreateSupplierReceiving, useSupplierReceivingDuplicate } from '../hooks/useSupplierReceivings';
import type { CreateSupplierReceivingInput } from '../types/supplier-receiving.types';

interface FormLine { key: number; productId: string; quantity: string }
export interface ReceivingFormValues { supplierId: string; referenceNumber: string; receivedOn: string; note: string; items: FormLine[] }
let nextLineKey = 1;
const newLine = (): FormLine => ({ key: nextLineKey++, productId: '', quantity: '1' });

export function localToday(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function validateReceivingForm(values: ReceivingFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.receivedOn) errors.receivedOn = 'Receiving date is required / تاريخ الاستلام مطلوب';
  if (!values.items.length) errors.items = 'Add at least one product / أضف منتجًا واحدًا على الأقل';
  const products = new Set<string>();
  values.items.forEach((line, index) => {
    if (!line.productId) errors[`items.${index}.productId`] = 'Select a product / اختر منتجًا';
    if (line.productId && products.has(line.productId)) errors.items = 'The same product cannot be added twice / لا يمكن إضافة المنتج نفسه مرتين';
    products.add(line.productId);
    const quantity = Number(line.quantity);
    if (!/^\d+$/.test(line.quantity) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) {
      errors[`items.${index}.quantity`] = 'Quantity must be a whole number from 1 to 100,000 / يجب أن تكون الكمية عددًا صحيحًا من 1 إلى 100000';
    }
  });
  return errors;
}

export function toCreateReceivingInput(values: ReceivingFormValues): CreateSupplierReceivingInput {
  return {
    supplierId: values.supplierId || null,
    referenceNumber: values.referenceNumber.trim() || null,
    receivedOn: values.receivedOn,
    note: values.note.trim() || null,
    items: values.items.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })),
  };
}

export const receivingDetailPath = (id: string) => `/inventory/receiving/${id}`;
export async function createReceivingAndNavigate(
  values: ReceivingFormValues,
  createReceiving: (input: CreateSupplierReceivingInput) => Promise<{ id: string }>,
  navigate: (path: string) => void
): Promise<void> {
  const receiving = await createReceiving(toCreateReceivingInput(values));
  navigate(receivingDetailPath(receiving.id));
}
export function receivingErrorMessage(error: unknown): string {
  return axios.isAxiosError(error)
    ? error.response?.data?.error?.message ?? 'Unable to receive stock / تعذر إدخال المخزون'
    : 'Unable to receive stock / تعذر إدخال المخزون';
}

export const SupplierReceivingForm: React.FC = () => {
  const navigate = useNavigate();
  const [values, setValues] = useState<ReceivingFormValues>({ supplierId: '', referenceNumber: '', receivedOn: localToday(), note: '', items: [newLine()] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const suppliers = useSuppliers({ isActive: true, pageSize: 100, sortBy: 'name' });
  const create = useCreateSupplierReceiving();
  const duplicate = useSupplierReceivingDuplicate(values.supplierId, values.referenceNumber);

  const updateLine = (key: number, change: Partial<FormLine>) => setValues((current) => ({ ...current, items: current.items.map((line) => line.key === key ? { ...line, ...change } : line) }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateReceivingForm(values);
    setErrors(nextErrors);
    setServerError('');
    if (Object.keys(nextErrors).length) return;
    try {
      await createReceivingAndNavigate(values, create.mutateAsync, navigate);
    } catch (error) {
      setServerError(receivingErrorMessage(error));
    }
  };

  return <form onSubmit={submit} className="space-y-5">
    <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
      <label className="text-sm font-semibold">Supplier (optional) / المورد (اختياري)
        <select aria-label="Supplier (optional) / المورد (اختياري)" value={values.supplierId} onChange={(event) => setValues({ ...values, supplierId: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
          <option value="">No supplier / بدون مورّد</option>
          {suppliers.data?.items.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">Reference number (optional) / رقم المرجع (اختياري)
        <input value={values.referenceNumber} onChange={(event) => setValues({ ...values, referenceNumber: event.target.value })} maxLength={200} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
      </label>
      <label className="text-sm font-semibold">Receiving date / تاريخ الاستلام
        <input required type="date" value={values.receivedOn} max={localToday()} onChange={(event) => setValues({ ...values, receivedOn: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        {errors.receivedOn && <span className="mt-1 block text-xs text-red-700">{errors.receivedOn}</span>}
      </label>
      <label className="text-sm font-semibold md:col-span-2">Note (optional) / ملاحظة (اختيارية)
        <textarea value={values.note} onChange={(event) => setValues({ ...values, note: event.target.value })} maxLength={2000} rows={3} dir="auto" className="user-text-input mt-1 w-full rounded-lg border border-slate-300 p-3" />
      </label>
    </section>

    {duplicate.data?.duplicate && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">A receiving document with this supplier and reference may already exist / قد يوجد مستند إدخال بنفس المورد والمرجع. You can still submit after checking the existing document / يمكنك المتابعة بعد مراجعة المستند الموجود.</div>}

    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Products / المنتجات</h2><p className="text-xs text-slate-500">Products needing an opening count remain visible but cannot be selected / المنتجات التي تحتاج جردًا افتتاحيًا تبقى ظاهرة ولا يمكن اختيارها</p></div><button type="button" onClick={() => setValues((current) => ({ ...current, items: [...current.items, newLine()] }))} className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700"><Plus className="h-4 w-4" />Add line / إضافة سطر</button></div>
      {values.items.map((line, index) => <div key={line.key} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
        <div className="text-sm font-semibold">Product / المنتج
          <div className="mt-1 font-normal"><ProductPicker
            selectedProductId={line.productId || null}
            onSelect={(product) => updateLine(line.key, { productId: product?.id ?? '' })}
            requireOpeningCount
            disabledProductIds={new Set(values.items.filter((item) => item.key !== line.key).map((item) => item.productId).filter(Boolean))}
          /></div>
          {errors[`items.${index}.productId`] && <span className="mt-1 block text-xs text-red-700">{errors[`items.${index}.productId`]}</span>}
        </div>
        <label className="text-sm font-semibold">Quantity / الكمية
          <input aria-label={`Quantity line ${index + 1}`} type="number" inputMode="numeric" min={1} max={100000} step={1} value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          {errors[`items.${index}.quantity`] && <span className="mt-1 block text-xs text-red-700">{errors[`items.${index}.quantity`]}</span>}
        </label>
        <button aria-label={`Remove product line ${index + 1}`} type="button" disabled={values.items.length === 1} onClick={() => setValues((current) => ({ ...current, items: current.items.filter((item) => item.key !== line.key) }))} className="self-end rounded-lg p-2.5 text-red-700 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-5 w-5" /></button>
      </div>)}
      {errors.items && <p role="alert" className="text-sm text-red-700">{errors.items}</p>}
    </section>
    {serverError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{serverError}</div>}
    <div className="flex justify-end gap-3"><button type="button" onClick={() => navigate('/inventory/receiving')} className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold">Cancel / إلغاء</button><button disabled={create.isPending} className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{create.isPending ? 'Saving… / جارٍ الحفظ…' : 'Receive Stock / إدخال إلى المخزون'}</button></div>
  </form>;
};
