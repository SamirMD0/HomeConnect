import { AuthedClient, authedHeaders, requestJson } from './hc-client';
import { buildSupplierPaymentPayload } from './supplier-payment-payload';

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

export async function recordSupplierPayment(
  client: AuthedClient,
  input: RecordPaymentInput
): Promise<RecordedPayment> {
  const transaction = await requestJson<SupplierTransactionResponse>(
    `${client.baseUrl}/api/v1/suppliers/${encodeURIComponent(input.supplierId)}/transactions`,
    {
      method: 'POST',
      headers: authedHeaders(client),
      body: JSON.stringify(buildSupplierPaymentPayload(input)),
    }
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
