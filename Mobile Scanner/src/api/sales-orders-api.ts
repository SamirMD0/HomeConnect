import type { SalesOrderRead } from '@shared/lookup-contracts';
import { lookupGet } from './lookup-http';
import type { AuthedClient } from './hc-client';
import { serverPage, LOOKUP_PAGE_SIZE } from '../lookup/pagination';
export interface OrderLookupFilters {
  search?: string;
  fulfillmentStatus?: string[];
  paymentStatus?: string[];
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
}
/** Same filters, CSV array params and response fields as desktop sales-orders.api.ts. */
export async function listSalesOrders(client: AuthedClient, filters: OrderLookupFilters, page = 1) {
  return serverPage(
    await lookupGet<SalesOrderRead[]>(client, '/sales-orders', {
      ...filters,
      sort: 'createdDesc',
      page,
      pageSize: LOOKUP_PAGE_SIZE,
    }),
    page
  );
}
export const getSalesOrder = (client: AuthedClient, id: string) =>
  lookupGet<SalesOrderRead>(client, `/sales-orders/${encodeURIComponent(id)}`);
