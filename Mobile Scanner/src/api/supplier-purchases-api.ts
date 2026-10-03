import { AuthedClient, authedHeaders, requestJson } from './hc-client';

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
  return requestJson<ReceiptCheckResult>(
    `${client.baseUrl}/api/v1/supplier-purchases/receipt-check?${query.toString()}`,
    { headers: authedHeaders(client) },
  );
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
