import React, { FormEvent, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { useRegenerateProductSku, useUpdateProductSku } from '../hooks/useProducts';
import { Product } from '../types/product.types';

export const ProductSkuEditDialog: React.FC<{ product: Product | null; onClose: () => void }> = ({ product, onClose }) => {
  const update = useUpdateProductSku(); const regenerate = useRegenerateProductSku();
  const [sku, setSku] = useState(''); const [reason, setReason] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  useEffect(() => { setSku(product?.sku ?? ''); setReason(''); setPassword(''); setError(''); }, [product]);
  if (!product) return null;
  const credentials = () => ({ reason: reason.trim(), accountPassword: password });
  const validate = () => { if (!/^[A-Z0-9-]{4,32}$/.test(sku.trim().toUpperCase())) return 'SKU must be 4-32 uppercase letters, numbers, or hyphens'; if (reason.trim().length < 5) return 'Reason must be at least 5 characters'; if (!password) return 'Account password is required'; return ''; };
  const submit = async (event: FormEvent) => { event.preventDefault(); const problem = validate(); if (problem) { setError(problem); return; } try { await update.mutateAsync({ id: product.id, input: { sku: sku.trim().toUpperCase(), ...credentials() } }); toast.success('SKU updated. Reprint existing labels.'); onClose(); } catch { setError('Unable to update SKU. Confirm the password and uniqueness.'); } };
  const issueNew = async () => { const problem = validate(); if (problem && !problem.startsWith('SKU must')) { setError(problem); return; } try { await regenerate.mutateAsync({ id: product.id, input: credentials() }); toast.success('New SKU issued. Reprint existing labels.'); onClose(); } catch { setError('Unable to regenerate SKU.'); } };
  return <Modal isOpen onClose={onClose} title="Edit SKU / تعديل رمز المنتج"><form onSubmit={submit} className="space-y-4"><p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0" />Changing the SKU invalidates every printed label for this product.</p><Field label="SKU" value={sku} set={setSku} /><Field label="Reason / السبب" value={reason} set={setReason} /><Field label="Account password / كلمة مرور الحساب" value={password} set={setPassword} type="password" />{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={issueNew} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800"><RefreshCw className="h-4 w-4" />Issue new SKU</button><button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white">Save SKU</button></div></form></Modal>;
};
const Field: React.FC<{ label: string; value: string; set: (value: string) => void; type?: string }> = ({ label, value, set, type = 'text' }) => <label className="block text-sm font-medium">{label}<input value={value} onChange={(event) => set(event.target.value)} type={type} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>;
