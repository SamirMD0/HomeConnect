import { authedHeaders, requestJson, type AuthedClient } from './hc-client';
export function lookupParams(values: object = {}): string {
  return new URLSearchParams(
    Object.entries(values).flatMap(([key, value]) =>
      value === undefined || value === null || value === ''
        ? []
        : [[key, Array.isArray(value) ? value.join(',') : String(value)]]
    )
  ).toString();
}
/** GET only, retaining Phase 1 auth, foreground refresh, and branch headers. */
export function lookupGet<T>(client: AuthedClient, path: string, params?: object): Promise<T> {
  const query = lookupParams(params);
  return requestJson<T>(`${client.baseUrl}/api/v1${path}${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authedHeaders(client),
  });
}
