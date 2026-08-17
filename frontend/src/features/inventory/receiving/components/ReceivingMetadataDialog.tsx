import React, { useState } from 'react';
import { Button, FormField, Input, Modal, Textarea } from '../../../../components/ui';
import { useUpdateReceivingMetadata } from '../hooks/useSupplierReceivings';
import { correctionReasonError, receivingCorrectionErrorMessage } from '../utils/receiving-correction';
import type { SupplierReceiving } from '../types/supplier-receiving.types';

/**
 * The safe half of admin correction: paperwork only.
 *
 * There is no product, quantity, or date field here by design — those describe
 * stock that already moved, and changing them in place would leave the movement
 * history describing a delivery that never happened. Correcting those is a void
 * plus a new receiving, which the void dialog explains.
 */
export const ReceivingMetadataDialog: React.FC<{
  receiving: SupplierReceiving;
  isOpen: boolean;
  onClose: () => void;
}> = ({ receiving, isOpen, onClose }) => {
  const [referenceNumber, setReferenceNumber] = useState(receiving.referenceNumber ?? '');
  const [note, setNote] = useState(receiving.note ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useUpdateReceivingMetadata(receiving.id);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const invalid = correctionReasonError(reason);
    if (invalid) return setError(invalid);
    try {
      await mutation.mutateAsync({ referenceNumber: referenceNumber.trim() || null, note: note.trim() || null, reason: reason.trim() });
      onClose();
    } catch (caught) {
      setError(receivingCorrectionErrorMessage(caught));
    }
  };

  return <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Correct reference and note / تصحيح المرجع والملاحظة"
    description="Paperwork only. Products, quantities, and the receiving date are not changed and no stock moves. / تصحيح بيانات المستند فقط — لا تتغير المنتجات أو الكميات أو التاريخ ولا يتحرك المخزون."
    size="lg"
  >
    <form onSubmit={submit} className="space-y-4">
      <FormField label="Reference number / رقم المرجع">
        {(field) => <Input {...field} value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} maxLength={200} />}
      </FormField>
      <FormField label="Note / الملاحظة">
        {(field) => <Textarea {...field} value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} />}
      </FormField>
      <FormField label="Reason for this correction / سبب التصحيح" required hint="Recorded in the document's correction history / يُسجَّل في سجل تصحيحات المستند">
        {(field) => <Textarea {...field} value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={1000} />}
      </FormField>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel / إلغاء</Button>
        <Button type="submit" isLoading={mutation.isPending}>Save correction / حفظ التصحيح</Button>
      </div>
    </form>
  </Modal>;
};
