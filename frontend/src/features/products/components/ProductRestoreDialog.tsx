import React, { FormEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui/Modal';
import { businessLabels } from '../../../shared/labels/business-labels';
import { useRestoreProduct } from '../hooks/useProducts';
import { productCorrectionSchema } from '../schemas/product.schemas';
import { Product } from '../types/product.types';
import { normalizeProductError } from '../utils/product-form-errors';
import { productLabels } from '../utils/product-labels';

export const ProductRestoreDialog: React.FC<{ product: Product | null; onClose: () => void }> = ({ product, onClose }) => {
  const mutation = useRestoreProduct();
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!product) return;
    const parsed = productCorrectionSchema.safeParse({ reason, accountPassword: password });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the required fields'); return; }
    mutation.mutate({ id: product.id, input: parsed.data }, {
      onSuccess: () => { toast.success('Product restored / تمت استعادة المنتج'); setReason(''); setPassword(''); onClose(); },
      onError: (failure) => setError(normalizeProductError(failure).message),
    });
  };
  return <Modal isOpen={Boolean(product)} onClose={onClose} title={businessLabels.product.restoreProduct}>
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">Restoring makes this product available for new service jobs / الاستعادة تجعل المنتج متاحاً لطلبات الصيانة الجديدة.</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <label className="block text-sm font-medium">{productLabels.reason} *<textarea value={reason} onChange={(event) => setReason(event.target.value)} dir="auto" className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="block text-sm font-medium">{productLabels.accountPassword} *<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2">{businessLabels.common.cancel}</button><button disabled={mutation.isPending} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{businessLabels.product.restoreProduct}</button></div>
    </form>
  </Modal>;
};
