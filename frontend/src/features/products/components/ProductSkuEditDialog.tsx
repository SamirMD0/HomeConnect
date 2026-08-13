import React, { FormEvent, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { useRegenerateProductSku, useUpdateProductSku } from '../hooks/useProducts';
import { Product } from '../types/product.types';

export const SKU_LABEL_WARNING = 'Changing SKU may invalidate printed labels already placed on products. / تغيير رمز المنتج قد يجعل الملصقات المطبوعة سابقًا غير صحيحة.';

/**
 * v1.8.1 dropped the account password here: the SKU is admin-only work, audited
 * with a server-generated reason. What replaced the password is an explicit
 * acknowledgement of the consequence, which is the thing a password never
 * checked — an admin who types their password has not thereby noticed that the
 * labels on the shelf are about to stop matching.
 */
export const ProductSkuEditDialog: React.FC<{ product: Product | null; onClose: () => void }> = ({ product, onClose }) => {
  const update = useUpdateProductSku(); const regenerate = useRegenerateProductSku();
  const [sku, setSku] = useState(''); const [acknowledged, setAcknowledged] = useState(false); const [error, setError] = useState('');
  useEffect(() => { setSku(product?.sku ?? ''); setAcknowledged(false); setError(''); }, [product]);
  if (!product) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^[A-Z0-9-]{4,32}$/.test(sku.trim().toUpperCase())) { setError('SKU must be 4-32 uppercase letters, numbers, or hyphens'); return; }
    if (!acknowledged) { setError('Confirm the printed-label warning before saving / أكّد التحذير قبل الحفظ'); return; }
    try { await update.mutateAsync({ id: product.id, input: { sku: sku.trim().toUpperCase() } }); toast.success('SKU updated. Reprint existing labels.'); onClose(); }
    catch { setError('Unable to update SKU. Confirm it is not already in use.'); }
  };
  const issueNew = async () => {
    if (!acknowledged) { setError('Confirm the printed-label warning before saving / أكّد التحذير قبل الحفظ'); return; }
    try { await regenerate.mutateAsync(product.id); toast.success('New SKU issued. Reprint existing labels.'); onClose(); }
    catch { setError('Unable to regenerate SKU.'); }
  };
  return <Modal isOpen onClose={onClose} title="Edit SKU / تعديل رمز المنتج"><form onSubmit={submit} className="space-y-4"><p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" dir="auto"><AlertTriangle className="h-5 w-5 shrink-0" />{SKU_LABEL_WARNING}</p><Field label="SKU" value={sku} set={setSku} /><label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" />I understand printed labels must be reprinted / أفهم أنه يجب إعادة طباعة الملصقات</label>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={issueNew} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800"><RefreshCw className="h-4 w-4" />Issue new SKU</button><button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white">Save SKU</button></div></form></Modal>;
};
const Field: React.FC<{ label: string; value: string; set: (value: string) => void; type?: string }> = ({ label, value, set, type = 'text' }) => <label className="block text-sm font-medium">{label}<input value={value} onChange={(event) => set(event.target.value)} type={type} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>;
