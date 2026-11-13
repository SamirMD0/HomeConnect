import type { ProductRead } from '@shared/lookup-contracts';
import {
  authedHeaders,
  HcApiError,
  prepareApiSession,
  refreshApiSession,
  requestJson,
  type AuthedClient,
} from '../api/hc-client';
import { scanLookup } from '../api/products-api';
import { getInventory, getProduct } from '../api/catalog-api';
import { lookupGet } from '../api/lookup-http';
import { isAccountPasswordMessage, type MovementPayload, type ReceivingPayload } from './stock-logic';

/** Same routes as the desktop inventory and receiving pages. */

export interface MovementResult {
  changed: boolean;
  message?: string;
  product: { id: string; stockQuantity: number };
  movement: { id: string; quantityBefore: number; quantityAfter: number } | null;
}

export interface ReceivingResult {
  id: string;
  referenceNumber: string | null;
  receivedOn: string;
}

/**
 * Stock corrections carry the account password. A wrong password comes back
 * as HTTP 401, the same status as an expired login, so these requests must not
 * use the client's automatic "refresh, retry, then sign out" path: one typo
 * would sign the operator out. A 401 whose message is about the account
 * password is returned to the form instead; any other 401 refreshes the login
 * once and retries.
 */
async function postWithPassword<T>(client: AuthedClient, path: string, body: object): Promise<T> {
  const url = `${client.baseUrl}/api/v1${path}`;
  const send = (token: string) =>
    requestJson<T>(
      url,
      {
        method: 'POST',
        headers: { ...authedHeaders(client), Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      },
      true
    );
  const token = (await prepareApiSession(client.baseUrl)) ?? client.token;
  try {
    return await send(token);
  } catch (error) {
    if (!(error instanceof HcApiError) || error.status !== 401) throw error;
    if (isAccountPasswordMessage(error.message)) throw passwordError(error);
    const fresh = await refreshApiSession();
    if (!fresh) throw error;
    try {
      return await send(fresh);
    } catch (retry) {
      if (retry instanceof HcApiError && retry.status === 401 && isAccountPasswordMessage(retry.message))
        throw passwordError(retry);
      throw retry;
    }
  }
}

function passwordError(error: HcApiError): HcApiError {
  return new HcApiError(error.message, 'VALIDATION', 401, 'ACCOUNT_PASSWORD');
}

export function postMovement(client: AuthedClient, productId: string, payload: MovementPayload) {
  const path = `/products/${encodeURIComponent(productId)}/stock-movements`;
  return payload.accountPassword
    ? postWithPassword<MovementResult>(client, path, payload)
    : requestJson<MovementResult>(`${client.baseUrl}/api/v1${path}`, {
        method: 'POST',
        headers: authedHeaders(client),
        body: JSON.stringify(payload),
      });
}

export function createReceiving(client: AuthedClient, payload: ReceivingPayload) {
  return requestJson<ReceivingResult>(`${client.baseUrl}/api/v1/inventory/receivings`, {
    method: 'POST',
    headers: authedHeaders(client),
    body: JSON.stringify(payload),
  });
}

export const receivingDuplicateCheck = (
  client: AuthedClient,
  supplierId: string,
  referenceNumber: string
) =>
  lookupGet<{ duplicate: boolean; match: ReceivingResult | null }>(
    client,
    '/inventory/receivings/duplicate-check',
    { supplierId, referenceNumber }
  );

/** Current shared stock, read fresh before any stock change. */
export async function currentStock(client: AuthedClient, productId: string): Promise<number> {
  return (await getInventory(client, productId)).product.stockQuantity;
}

/** Barcode/SKU → the full product the stock screens need. */
export async function productForCode(client: AuthedClient, code: string): Promise<ProductRead> {
  const result = await scanLookup(client, code);
  if (!result.product) throw new Error(`No product matches "${code}".`);
  if (!result.product.isActive) throw new Error(`${result.product.name} is archived.`);
  return getProduct(client, result.product.id);
}
