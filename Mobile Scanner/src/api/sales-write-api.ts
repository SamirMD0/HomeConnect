import type { CustomerRead, CustomerFinancialRead, SalesOrderRead } from '@shared/lookup-contracts';
import type {
  BusinessSettings,
  PaymentReceipt,
} from '../../../frontend/src/features/documents/types/document.types';
import type {
  OrderPayload,
  PaymentPayload,
  PaymentResult,
  OrderForm,
  PaymentForm,
} from '../sales/contracts';
import { authedHeaders, requestJson, type AuthedClient } from './hc-client';
import { lookupGet } from './lookup-http';
export type { BusinessSettings, PaymentReceipt };
export type SalesWriteClient = AuthedClient & { branchId: string };
function post<T>(client: SalesWriteClient, path: string, payload: object): Promise<T> {
  return requestJson<T>(`${client.baseUrl}/api/v1${path}`, {
    method: 'POST',
    headers: { ...authedHeaders(client), 'X-Branch-Scope': client.branchId },
    body: JSON.stringify(payload),
  });
}
export const createOrder = (client: SalesWriteClient, payload: OrderPayload) =>
  post<SalesOrderRead>(client, '/sales-orders', payload);
export const createCustomer = (client: SalesWriteClient, payload: OrderForm['newCustomer']) =>
  post<CustomerRead>(client, '/customers', payload);
export const recordPayment = (
  client: SalesWriteClient,
  form: Pick<PaymentForm, 'targetType' | 'targetId'>,
  payload: PaymentPayload
) =>
  post<PaymentResult>(
    client,
    `/${form.targetType === 'DEBT' ? 'debts' : 'installment-plans'}/${encodeURIComponent(form.targetId)}/payments`,
    payload
  );
export const getPaymentTargets = (client: AuthedClient, customerId: string) =>
  lookupGet<CustomerFinancialRead>(
    client,
    `/customers/${encodeURIComponent(customerId)}/financial-summary`,
    { includeCancelled: false, includePayments: false, debtLimit: 100, planLimit: 100 }
  );
export const getPaymentReceipt = (client: AuthedClient, paymentId: string) =>
  lookupGet<PaymentReceipt>(client, `/payments/${encodeURIComponent(paymentId)}/receipt`);
export const getReceiptBusiness = (client: AuthedClient) =>
  lookupGet<BusinessSettings>(client, '/business-settings');
