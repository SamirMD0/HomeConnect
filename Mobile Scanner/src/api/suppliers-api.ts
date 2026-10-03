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
  const query = new URLSearchParams({ page: '1', pageSize: '200' });
  const data = await requestJson<Paginated<SupplierSummary> | SupplierSummary[]>(
    `${client.baseUrl}/api/v1/suppliers?${query.toString()}`,
    { headers: authedHeaders(client) },
  );
  // Backends return either a plain array or a paginated envelope — tolerate both.
  if (Array.isArray(data)) return data;
  return data.rows ?? [];
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
