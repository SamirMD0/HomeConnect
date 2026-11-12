import type {
  SupplierRead,
  PurchaseRead,
  BillRead,
  StatementRead,
  DateRange,
} from '@shared/lookup-contracts';
import type { AuthedClient } from './hc-client';
import { authedHeaders, HcApiError, prepareApiSession, refreshApiSession } from './hc-client';
import { lookupGet } from './lookup-http';
import { serverPage, LOOKUP_PAGE_SIZE } from '../lookup/pagination';
/** Desktop suppliers.api.ts, supplier-purchases.api.ts, supplier-bills.api.ts and customer-statements.api.ts. */
export async function listSupplierLookup(client: AuthedClient, search = '', page = 1) {
  return serverPage(
    await lookupGet<SupplierRead[]>(client, '/suppliers', {
      search,
      page,
      pageSize: LOOKUP_PAGE_SIZE,
      sortBy: 'name',
      sortOrder: 'asc',
    }),
    page
  );
}
export const getSupplier = (client: AuthedClient, id: string) =>
  lookupGet<SupplierRead>(client, `/suppliers/${encodeURIComponent(id)}`);
export const getSupplierStatement = (client: AuthedClient, id: string, range: DateRange) =>
  lookupGet<StatementRead>(client, `/suppliers/${encodeURIComponent(id)}/statement`, range);
export async function listPurchases(client: AuthedClient, supplierId: string, page = 1) {
  return serverPage(
    await lookupGet<PurchaseRead[]>(
      client,
      `/suppliers/${encodeURIComponent(supplierId)}/purchases`,
      { page, pageSize: LOOKUP_PAGE_SIZE }
    ),
    page
  );
}
export const listBills = (
  client: AuthedClient,
  supplierId: string,
  linked: 'true' | 'false' | 'all' = 'all'
) =>
  lookupGet<BillRead[]>(client, `/suppliers/${encodeURIComponent(supplierId)}/bills`, { linked });

export async function getBillImage(client: AuthedClient, bill: BillRead): Promise<string> {
  let token = await prepareApiSession(client.baseUrl);
  if (!token) throw new HcApiError('Please sign in again.', 'UNAUTHORIZED', 401);
  const url = `${client.baseUrl}/api/v1/supplier-bills/${encodeURIComponent(bill.id)}/image`;
  const send = async () => {
    try {
      return await fetch(url, {
        headers: {
          ...authedHeaders({ ...client, token: token! }),
          'X-Branch-Scope': bill.branchId,
        },
      });
    } catch {
      throw new HcApiError('Cannot reach the shop PC. Check Wi-Fi and retry.', 'NETWORK');
    }
  };
  let response = await send();
  if (response.status === 401) {
    token = await refreshApiSession();
    if (token) response = await send();
  }
  if (!response.ok)
    throw new HcApiError(
      'Could not load the bill image. Retry when connected to the shop PC.',
      response.status === 401 ? 'UNAUTHORIZED' : 'SERVER',
      response.status
    );
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the bill image.'));
    reader.readAsDataURL(blob);
  });
}
