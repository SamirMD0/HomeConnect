import type { PaymentForm, PaymentPayload } from '../sales/contracts';
import type { RecordPaymentInput } from '../api/supplier-transactions-api';
import { buildSupplierPaymentPayload } from '../api/supplier-payment-payload';
export const customerPaymentAction = (
  form: Pick<PaymentForm, 'targetType' | 'targetId'>,
  payload: PaymentPayload
) => ({ targetType: form.targetType, targetId: form.targetId, ...payload });
export const supplierPaymentAction = (input: RecordPaymentInput) => ({
  supplierId: input.supplierId,
  ...buildSupplierPaymentPayload(input),
});
export const supplierBillAction = (supplierId: string, note?: string, billGroupId?: string) => ({
  supplierId,
  ...(note?.trim() ? { note: note.trim() } : {}),
  ...(billGroupId ? { billGroupId } : {}),
});
