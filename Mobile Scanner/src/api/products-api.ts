import { ConnectionSettings, ScanResult } from '../types/scanner.types';
import { AuthedClient, authedHeaders, backendBaseUrl, requestJson } from './hc-client';

/**
 * Barcode / SKU lookup against the main backend's /api/v1/products/scan.
 * The response shape is already mirrored by `ScanResult` on the mobile
 * types, so no mapping is needed.
 */
export async function scanLookup(client: AuthedClient, code: string): Promise<ScanResult> {
  const query = new URLSearchParams({ code });
  return requestJson<ScanResult>(`${client.baseUrl}/api/v1/products/scan?${query.toString()}`, {
    headers: authedHeaders(client),
  });
}

/** Convenience: assemble the `AuthedClient` the lookup needs from stored settings. */
export function clientFrom(connection: ConnectionSettings, token: string): AuthedClient {
  return { baseUrl: backendBaseUrl(connection), token };
}
