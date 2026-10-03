import { ApiFailure, ApiSuccess, ConnectionSettings } from '../types/scanner.types';

/**
 * Direct HTTP client for Home Connect's main /api/v1/* surface. Unlike the
 * legacy `scanner-api.ts` (which pairs with the desktop app's LAN scanner
 * endpoint on port 3011), this client authenticates with the real backend
 * using the same JWT the Electron frontend uses.
 *
 * Phase 1 scope: login + barcode scan lookup. Later phases add supplier
 * payments, receipt upload, and the Statement of Account.
 */

const REQUEST_TIMEOUT_MS = 10_000;

export type HcApiErrorKind = 'UNAUTHORIZED' | 'RATE_LIMITED' | 'VALIDATION' | 'NETWORK' | 'SERVER';

export class HcApiError extends Error {
  constructor(
    message: string,
    public readonly kind: HcApiErrorKind,
    public readonly status: number | null = null,
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'HcApiError';
  }
}

function errorKind(status: number): HcApiErrorKind {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400 || status === 413 || status === 422) return 'VALIDATION';
  return 'SERVER';
}

export function backendBaseUrl(connection: ConnectionSettings): string {
  const normalisedHost = connection.host.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const port = connection.port === 443 ? '' : `:${connection.port}`;
  const scheme = connection.port === 443 ? 'https' : 'http';
  return `${scheme}://${normalisedHost}${port}`;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new HcApiError(
      'Cannot reach the Home Connect server. Check Wi-Fi and the backend URL.',
      'NETWORK',
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One-shot request helper. Treats the server's `{ success, data }` envelope as
 * the contract and normalises network / 4xx / 5xx failures into `HcApiError`.
 */
export async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithTimeout(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // Non-JSON body — fall through to the generic handling below.
  }

  if (response.ok && parsed && typeof parsed === 'object' && (parsed as ApiSuccess<T>).success === true) {
    return (parsed as ApiSuccess<T>).data;
  }

  const failure = parsed as ApiFailure | null;
  const code = failure?.error?.code ?? null;
  const message = failure?.error?.message ?? defaultMessage(response.status);
  throw new HcApiError(message, errorKind(response.status), response.status, code);
}

function defaultMessage(status: number): string {
  if (status === 401) return 'Session expired. Please sign in again.';
  if (status === 429) return 'Too many requests. Wait a moment and try again.';
  if (status >= 500) return 'The server could not finish the request.';
  return 'The server rejected the request.';
}

export interface AuthedClient {
  baseUrl: string;
  token: string;
}

export function authedHeaders(client: AuthedClient): Record<string, string> {
  return { Authorization: `Bearer ${client.token}` };
}
