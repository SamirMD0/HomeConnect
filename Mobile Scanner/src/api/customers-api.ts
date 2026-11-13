import type { CustomerRead, CustomerFinancialRead, StatementRead, DateRange } from '@shared/lookup-contracts';
import type { AuthedClient } from './hc-client';
import { lookupGet } from './lookup-http';
import { LOOKUP_PAGE_SIZE, serverPage } from '../lookup/pagination';
/** Same customer routes as frontend/src/features/customers/api/customers.api.ts.
 * No balance calculation or other business logic belongs in this adapter. */
export async function listCustomers(client: AuthedClient, search = '', page = 1) {
  return serverPage(await lookupGet<CustomerRead[]>(client, '/customers', { search, page, limit: LOOKUP_PAGE_SIZE, include: 'financial', sortBy: 'name', sortOrder: 'asc' }), page);
}
export function getCustomer(client: AuthedClient, id: string) {
  return lookupGet<CustomerRead>(client, `/customers/${encodeURIComponent(id)}`);
}
export const getCustomerFinancial = (client: AuthedClient, id: string) => lookupGet<CustomerFinancialRead>(client, `/customers/${encodeURIComponent(id)}/financial-summary`);
export const getCustomerStatement = (client: AuthedClient, id: string, range: DateRange) => lookupGet<StatementRead>(client, `/customers/${encodeURIComponent(id)}/statement`, range);
