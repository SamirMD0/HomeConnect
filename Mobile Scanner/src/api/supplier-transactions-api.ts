import { AuthedClient, authedHeaders, requestJson } from './hc-client';

export type PaymentMethod = 'CASH_USD' | 'CASH_LBP' | 'CHEQUE' | 'BANK_TRANSFER';

export interface RecordPaymentInput {
  supplierId: string;
  amount: number;
  currency: 'USD' | 'LBP';
  paymentMethod: PaymentMethod;
  note?: string;
  occurredAt?: string;
}

export interface RecordedPayment {
  id: string;
  supplierId: string;
  amount: number;
  currency: 'USD' | 'LBP';
  paymentMethod: PaymentMethod;
  occurredAt: string;
}

interface SupplierTransactionResponse {
  id: string;
  supplierId: string;
  amount: string;
  currency: 'USD' | 'LBP';
  paymentMethod: PaymentMethod;
  transactionDate: string;
}

function localBusinessDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function businessDate(value?: string): string {
  return value ? value.slice(0, 10) : localBusinessDate();
}

export async function recordSupplierPayment(
  client: AuthedClient,
  input: RecordPaymentInput,
): Promise<RecordedPayment> {
  const amount = input.currency === 'LBP'
    ? input.amount.toFixed(0)
    : input.amount.toFixed(2);
  const transaction = await requestJson<SupplierTransactionResponse>(
    `${client.baseUrl}/api/v1/suppliers/${encodeURIComponent(input.supplierId)}/transactions`,
    {
      method: 'POST',
      headers: authedHeaders(client),
      body: JSON.stringify({
        type: 'SUPPLIER_PAYMENT',
        amount,
        currency: input.currency,
        paymentMethod: input.paymentMethod,
        transactionDate: businessDate(input.occurredAt),
        description: 'Supplier payment',
        ...(input.note?.trim() ? { notes: input.note.trim() } : {}),
      }),
    },
  );

  return {
    id: transaction.id,
    supplierId: transaction.supplierId,
    amount: Number(transaction.amount),
    currency: transaction.currency,
    paymentMethod: transaction.paymentMethod,
    occurredAt: transaction.transactionDate,
  };
}
