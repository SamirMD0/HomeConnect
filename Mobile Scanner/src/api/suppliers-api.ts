import { AuthedClient, authedHeaders, requestJson } from './hc-client';

/**
 * Thin wrappers around the main backend's supplier endpoints. The mobile
 * uses these to let the operator pick a supplier and then a recent purchase
 * when attaching a receipt photo.
 */

export interface SupplierSummary {
  id: string;
  name: string;
  phone: string | null;
}

export interface SupplierPurchaseSummary {
  id: string;
  referenceNumber: string | null;
  receivedOn: string; // ISO date
  supplierId: string | null;
  note: string | null;
  status: string;
}

interface Paginated<T> {
  rows: T[];
  total: number;
}

export async function listSuppliers(client: AuthedClient): Promise<SupplierSummary[]> {
  // The supplier route caps pageSize at 100. Fetch subsequent pages so the
  // local name/phone picker still includes suppliers beyond the first page.
  const pageSize = 100;
  const suppliers: SupplierSummary[] = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const data = await requestJson<Paginated<SupplierSummary> | SupplierSummary[]>(
      `${client.baseUrl}/api/v1/suppliers?${query.toString()}`,
      { headers: authedHeaders(client) },
    );
    const rows = Array.isArray(data) ? data : data.rows ?? [];
    suppliers.push(...rows);
    if (rows.length < pageSize || (!Array.isArray(data) && suppliers.length >= data.total)) {
      return suppliers;
    }
  }
}

export async function listSupplierPurchases(
  client: AuthedClient,
  supplierId: string,
): Promise<SupplierPurchaseSummary[]> {
  const query = new URLSearchParams({ page: '1', pageSize: '50' });
  const data = await requestJson<Paginated<SupplierPurchaseSummary> | SupplierPurchaseSummary[]>(
    `${client.baseUrl}/api/v1/suppliers/${encodeURIComponent(supplierId)}/purchases?${query.toString()}`,
    { headers: authedHeaders(client) },
  );
  if (Array.isArray(data)) return data;
  return data.rows ?? [];
}
