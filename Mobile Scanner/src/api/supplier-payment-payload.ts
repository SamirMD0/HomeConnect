import type { RecordPaymentInput } from './supplier-transactions-api';
/** Shared verbatim by the LAN endpoint and the cloud action envelope. */
export function buildSupplierPaymentPayload(input: RecordPaymentInput) {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return {
    type: 'SUPPLIER_PAYMENT' as const,
    amount: input.currency === 'LBP' ? input.amount.toFixed(0) : input.amount.toFixed(2),
    currency: input.currency,
    paymentMethod: input.paymentMethod,
    transactionDate: input.occurredAt ? input.occurredAt.slice(0, 10) : date,
    description: 'Supplier payment',
    ...(input.note?.trim() ? { notes: input.note.trim() } : {}),
  };
}
