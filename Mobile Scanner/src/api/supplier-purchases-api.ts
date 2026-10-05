import { AuthedClient, authedHeaders, HcApiError, requestJson } from './hc-client';

/**
 * Thrown when the shop PC's backend is too old to answer a receipt-duplicate
 * check (the endpoint returns 404). Treating 404 as "no duplicate" would let an
 * operator record a duplicate silently on an un-updated shop PC, so we refuse
 * to submit until the PC is updated.
 */
export class BackendTooOldError extends Error {
  constructor(message = 'Shop PC is older than this mobile build. Update HomeConnect on the PC first.') {
    super(message);
    this.name = 'BackendTooOldError';
  }
}

export type PurchaseCurrency = 'USD' | 'LBP';

export interface PurchaseProduct {
  id: string;
  name: string;
  model: string;
  sku: string;
  priceCurrency: PurchaseCurrency | null;
  trackStock: boolean;
  stockQuantity: number;
  notInInventory: boolean;
  pricing?: { costPrice?: string | null };
}

export type PurchaseLineInput =
  | { kind: 'EXISTING_PRODUCT'; productId: string; quantity: number; unitPrice: string; priceIncludesVat?: boolean }
  | { kind: 'MANUAL'; description: string; amount: string; priceIncludesVat?: boolean };

export interface CreateSupplierPurchaseInput {
  supplierId: string;
  idempotencyKey: string;
  receiptNumber?: string;
  transactionDate: string;
  dueDate?: string;
  currency: PurchaseCurrency;
  description: string;
  reference?: string;
  notes?: string;
  receiveStock: boolean;
  amountOverride?: string;
  amountOverrideReason?: string;
  paidAmount?: string;
  paymentReference?: string;
  lines: PurchaseLineInput[];
}

export interface RecordedSupplierPurchase {
  id: string;
  supplierId: string;
  amount: string;
  lineSum: string;
  currency: PurchaseCurrency;
  receiptNumber: string | null;
  transactionDate: string;
  supplierReceivingId: string | null;
}

export interface ReceiptCheckResult {
  duplicate: boolean;
  matches: Array<{ id: string; receiptNumber: string | null; amount: string; transactionDate: string }>;
}

export async function searchPurchaseProducts(client: AuthedClient, search: string): Promise<PurchaseProduct[]> {
  const query = new URLSearchParams({ search, isActive: 'true', page: '1', pageSize: '50' });
  return requestJson<PurchaseProduct[]>(`${client.baseUrl}/api/v1/products?${query.toString()}`, {
    headers: authedHeaders(client),
  });
}

export async function checkSupplierReceipt(
  client: AuthedClient,
  supplierId: string,
  receiptNumber: string,
): Promise<ReceiptCheckResult> {
  const query = new URLSearchParams({ supplierId, receiptNumber });
  try {
    return await requestJson<ReceiptCheckResult>(
      `${client.baseUrl}/api/v1/supplier-purchases/receipt-check?${query.toString()}`,
      { headers: authedHeaders(client) },
    );
  } catch (error) {
    // A 404 means the route is missing from this shop PC's backend, which only
    // happens when the PC is on a build older than this mobile client. The
    // mobile-api gateway returns the same status for a route that is not in
    // its allowlist, so an un-updated PC also lands here. Either way, refuse
    // to submit — silently returning "no duplicate" would hide a real risk.
    if (error instanceof HcApiError && error.status === 404) {
      throw new BackendTooOldError();
    }
    throw error;
  }
}

export async function recordSupplierPurchase(
  client: AuthedClient,
  input: CreateSupplierPurchaseInput,
): Promise<RecordedSupplierPurchase> {
  const { supplierId, ...body } = input;
  return requestJson<RecordedSupplierPurchase>(
    `${client.baseUrl}/api/v1/suppliers/${encodeURIComponent(supplierId)}/purchases`,
    { method: 'POST', headers: authedHeaders(client), body: JSON.stringify(body) },
  );
}
