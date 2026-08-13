import React, { FormEvent, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui/Modal';
import { useVerifyOpeningCount } from '../hooks/useInventory';

interface Props {
  productId: string;
  productName: string;
  open: boolean;
  onClose: () => void;
}

export function validateOpeningCountForm(
  verifiedCount: number,
  reason: string,
  accountPassword: string
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isInteger(verifiedCount) || verifiedCount < 0) errors.verifiedCount = 'Enter a non-negative whole count / أدخل جردًا صحيحًا غير سالب';
  if (!reason.trim()) errors.reason = 'Reason is required / السبب مطلوب';
  if (!accountPassword) errors.accountPassword = 'Account password is required / كلمة مرور الحساب مطلوبة';
  return errors;
}

export const VerifyOpeningCountDialog: React.FC<Props> = ({ productId, productName, open, onClose }) => {
  const mutation = useVerifyOpeningCount();
  const [verifiedCount, setVerifiedCount] = useState<number | ''>('');
  const [reason, setReason] = useState('Physical opening count / جرد افتتاحي فعلي');
  const [note, setNote] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (!open) return;
    setVerifiedCount('');
    setReason('Physical opening count / جرد افتتاحي فعلي');
    setNote('');
    setAccountPassword('');
    setErrors({});
    setServerError('');
  }, [open]);

  if (!open) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsedCount = verifiedCount === '' ? Number.NaN : verifiedCount;
    const nextErrors = validateOpeningCountForm(parsedCount, reason, accountPassword);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setServerError('');
    try {
      await mutation.mutateAsync({ productId, input: {
        verifiedCount: parsedCount,
        reason: reason.trim(),
        note: note.trim() || null,
        accountPassword,
      } });
      toast.success('Opening count verified / تم تأكيد الجرد الافتتاحي');
      onClose();
    } catch (error) {
      setServerError(axios.isAxiosError(error)
        ? error.response?.data?.error?.message ?? 'Opening count verification failed / فشل تأكيد الجرد الافتتاحي'
        : 'Opening count verification failed / فشل تأكيد الجرد الافتتاحي');
    }
  };

  return <Modal isOpen onClose={onClose} title="Verify Opening Count / تأكيد الجرد الافتتاحي" description={productName}>
    <form onSubmit={submit} className="space-y-4">
      {serverError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" dir="auto">{serverError}</p>}
      <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Physically count this product before confirming. Zero is valid for an empty shelf / عدّ هذا المنتج فعليًا قبل التأكيد. الصفر صالح للرف الفارغ.</p>
      <label className="block text-sm font-semibold text-slate-700">Verified count / الجرد المؤكد<input aria-label="Verified count / الجرد المؤكد" type="number" min="0" step="1" value={verifiedCount} onChange={(event) => setVerifiedCount(event.target.value === '' ? '' : Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />{errors.verifiedCount && <span className="mt-1 block text-xs text-red-600">{errors.verifiedCount}</span>}</label>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center text-lg font-bold tabular-nums">0 → {verifiedCount === '' ? '—' : verifiedCount}</div>
      <label className="block text-sm font-semibold text-slate-700">Reason / السبب<textarea dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} className="user-text-input mt-1 w-full rounded-lg border border-slate-300 p-3" />{errors.reason && <span className="mt-1 block text-xs text-red-600">{errors.reason}</span>}</label>
      <label className="block text-sm font-semibold text-slate-700">Note (optional) / ملاحظة (اختياري)<textarea dir="auto" value={note} onChange={(event) => setNote(event.target.value)} className="user-text-input mt-1 w-full rounded-lg border border-slate-300 p-3" /></label>
      <label className="block text-sm font-semibold text-slate-700">Account password / كلمة مرور الحساب<input type="password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />{errors.accountPassword && <span className="mt-1 block text-xs text-red-600">{errors.accountPassword}</span>}</label>
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2">Cancel / إلغاء</button><button disabled={mutation.isPending} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Verifying… / جارٍ التأكيد' : 'Verify Opening Count / تأكيد الجرد الافتتاحي'}</button></div>
    </form>
  </Modal>;
};
