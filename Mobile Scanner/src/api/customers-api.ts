import type { CustomerSummary } from '@shared/mobile-contracts';
import { authedHeaders, requestJson, type AuthedClient } from './hc-client';
/** Same customer routes as frontend/src/features/customers/api/customers.api.ts.
 * No balance calculation or other business logic belongs in this adapter. */
export function listCustomers(client: AuthedClient, search = '') {
  const query = new URLSearchParams({ search, page: '1', limit: '25' });
  return requestJson<CustomerSummary[]>(`${client.baseUrl}/api/v1/customers?${query}`, {
    headers: authedHeaders(client),
  });
}
export function getCustomer(client: AuthedClient, id: string) {
  return requestJson<CustomerSummary>(
    `${client.baseUrl}/api/v1/customers/${encodeURIComponent(id)}`,
    { headers: authedHeaders(client) }
  );
}
