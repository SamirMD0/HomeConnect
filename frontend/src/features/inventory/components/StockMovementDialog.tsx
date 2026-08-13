import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui/Modal';
import { useCreateStockMovement } from '../hooks/useInventory';
import type { WiredStockMovementType } from '../types/inventory.types';
import { guardedMovementTypes, movementAfter, movementLabels, validateMovementForm } from '../utils/stock-movement';

interface Props {
  productId: string;
  productName: string;
  currentQuantity: number;
  type: WiredStockMovementType | null;
  onClose: () => void;
}

export const StockMovementDialog: React.FC<Props> = ({ productId, productName, currentQuantity, type, onClose }) => {
  const mutation = useCreateStockMovement();
  const [quantity, setQuantity] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (!type) return;
    setQuantity(''); setReason(''); setNote(''); setAccountPassword(''); setErrors({}); setServerError('');
  }, [type]);

  const after = useMemo(() => type && quantity !== '' ? movementAfter(type, currentQuantity, quantity) : null, [type, quantity, currentQuantity]);
  if (!type) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = quantity === '' ? Number.NaN : quantity;
    const submittedReason = type === 'STOCK_COUNT' ? 'Physical stock count' : reason.trim();
    const nextErrors = validateMovementForm(type, parsed, submittedReason, accountPassword);
    if (after != null && after < 0) nextErrors.quantity = `Cannot reduce ${currentQuantity} by ${parsed} / لا يمكن تخفيض ${currentQuantity} بمقدار ${parsed}`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setServerError('');
    try {
      const result = await mutation.mutateAsync({ productId, input: {
        movementType: type,
        quantity: parsed,
        expectedBefore: currentQuantity,
        reason: submittedReason,
        note: note.trim() || null,
        ...(guardedMovementTypes.includes(type) ? { accountPassword } : {}),
      } });
      toast.success(result.message ?? 'Stock updated / تم تحديث المخزون');
      onClose();
    } catch (error) {
      setServerError(axios.isAxiosError(error) ? error.response?.data?.error?.message ?? 'Stock action failed / فشلت حركة المخزون' : 'Stock action failed / فشلت حركة المخزون');
    }
  };

  return <Modal isOpen onClose={onClose} title={movementLabels[type]} description={productName}>
    <form onSubmit={submit} className="space-y-4">
      {serverError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" dir="auto">{serverError}</p>}
      <label className="block text-sm font-semibold text-slate-700">{type === 'STOCK_COUNT' ? 'Counted total / إجمالي الجرد' : 'Quantity / الكمية'}<input aria-label={type === 'STOCK_COUNT' ? 'Counted total / إجمالي الجرد' : 'Quantity / الكمية'} type="number" min="0" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value === '' ? '' : Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />{errors.quantity && <span className="mt-1 block text-xs text-red-600">{errors.quantity}</span>}</label>
      <div className={`rounded-lg border p-3 text-center text-lg font-bold tabular-nums ${after != null && after < 0 ? 'border-red-300 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{currentQuantity} → {after ?? '—'}</div>
      {type !== 'STOCK_COUNT' && <label className="block text-sm font-semibold text-slate-700">Reason / السبب<textarea dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} className="user-text-input mt-1 w-full rounded-lg border border-slate-300 p-3" />{errors.reason && <span className="mt-1 block text-xs text-red-600">{errors.reason}</span>}</label>}
      <label className="block text-sm font-semibold text-slate-700">Note (optional) / ملاحظة (اختياري)<textarea dir="auto" value={note} onChange={(event) => setNote(event.target.value)} className="user-text-input mt-1 w-full rounded-lg border border-slate-300 p-3" /></label>
      {guardedMovementTypes.includes(type) && <label className="block text-sm font-semibold text-slate-700">Account password / كلمة مرور الحساب<input type="password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />{errors.accountPassword && <span className="mt-1 block text-xs text-red-600">{errors.accountPassword}</span>}</label>}
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2">{type === 'STOCK_COUNT' ? 'Cancel' : 'Cancel / إلغاء'}</button><button disabled={mutation.isPending} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{mutation.isPending ? (type === 'STOCK_COUNT' ? 'Saving…' : 'Saving… / جارٍ الحفظ') : (type === 'STOCK_COUNT' ? 'Confirm' : 'Confirm / تأكيد')}</button></div>
    </form>
  </Modal>;
};
