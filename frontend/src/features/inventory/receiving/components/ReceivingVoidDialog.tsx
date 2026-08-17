import { AlertTriangle } from 'lucide-react';
import React, { useState } from 'react';
import { Button, FormField, Input, Modal, Textarea } from '../../../../components/ui';
import { useVoidSupplierReceiving } from '../hooks/useSupplierReceivings';
import { receivingCorrectionErrorMessage, reversibleLines, voidRequestError } from '../utils/receiving-correction';
import type { SupplierReceiving } from '../types/supplier-receiving.types';

/**
 * Voiding is a reversal, not a delete, and the dialog says so before the admin
 * commits: it lists exactly which product loses exactly how many units, and
 * states plainly that the document and its history stay.
 */
export const ReceivingVoidDialog: React.FC<{
  receiving: SupplierReceiving;
  isOpen: boolean;
  onClose: () => void;
}> = ({ receiving, isOpen, onClose }) => {
  const [reason, setReason] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useVoidSupplierReceiving(receiving.id);
  const lines = reversibleLines(receiving);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const invalid = voidRequestError(reason, accountPassword);
    if (invalid) return setError(invalid);
    try {
      await mutation.mutateAsync({ reason: reason.trim(), accountPassword });
      setAccountPassword('');
      onClose();
    } catch (caught) {
      setAccountPassword('');
      setError(receivingCorrectionErrorMessage(caught));
    }
  };

  return <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Void receiving document / إلغاء مستند الإدخال"
    size="lg"
  >
    <form onSubmit={submit} className="space-y-4">
      <div role="note" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">This reverses the stock this document received. It does not delete any history. / هذا الإجراء يعكس المخزون الذي أدخله هذا المستند، ولا يحذف أي سجل.</p>
          <p>The document, its lines, and its original stock movements stay visible. A matching reversal movement is recorded next to each one. / يبقى المستند وبنوده وحركات المخزون الأصلية ظاهرة، وتُسجَّل حركة عكسية مقابلة لكل منها.</p>
          <p>To fix a wrong product or quantity, void this document and then create a new corrected receiving. / لتصحيح منتج أو كمية خاطئة، ألغِ هذا المستند ثم أنشئ مستند إدخال جديدًا مصححًا.</p>
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-bold">Stock to be reversed / المخزون الذي سيُعكس</h3>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {lines.map((line) => <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="user-text" dir="auto">{line.product.name} <span className="font-mono text-xs text-slate-500">{line.product.sku}</span></span>
            <span className="font-bold tabular-nums text-red-700">−{line.quantity}</span>
          </li>)}
        </ul>
      </section>

      <FormField label="Reason for voiding / سبب الإلغاء" required hint="Recorded on the document and on every reversal movement / يُسجَّل على المستند وعلى كل حركة عكسية">
        {(field) => <Textarea {...field} value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={1000} />}
      </FormField>
      <FormField label="Your account password / كلمة مرور حسابك" required hint="Required for every admin action that removes stock / مطلوبة لكل إجراء إداري يُخرج مخزونًا">
        {(field) => <Input {...field} type="password" autoComplete="current-password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} />}
      </FormField>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel / إلغاء</Button>
        <Button type="submit" variant="danger" isLoading={mutation.isPending}>Void receiving / إلغاء المستند</Button>
      </div>
    </form>
  </Modal>;
};
