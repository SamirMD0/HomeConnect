import {
  ApiFailure,
  ApiSuccess,
  ConnectionSettings,
  PairingResult,
  ScanResult,
  SessionResult,
} from '../types/scanner.types';
import { eventPayload } from '../utils/scan-code';
import { scannerBaseUrl } from '../utils/scanner-url';

const REQUEST_TIMEOUT_MS = 7_000;

export type ScannerApiErrorKind = 'UNAUTHORIZED' | 'RATE_LIMITED' | 'VALIDATION' | 'NETWORK' | 'SERVER';

export class ScannerApiError extends Error {
  constructor(
    message: string,
    public readonly kind: ScannerApiErrorKind,
    public readonly status: number | null = null,
    public readonly code: string | null = null
  ) {
    super(message);
    this.name = 'ScannerApiError';
  }
}

function errorKind(status: number): ScannerApiErrorKind {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400 || status === 413) return 'VALIDATION';
  return 'SERVER';
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ScannerApiError(
      'Cannot reach the PC scanner. Check Wi-Fi and make sure Scanner Hub is turned on.',
      'NETWORK'
    );
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(url, init);
  let body: ApiSuccess<T> | ApiFailure | null = null;
  try {
    body = (await response.json()) as ApiSuccess<T> | ApiFailure;
  } catch {
    throw new ScannerApiError('The PC returned an unreadable response.', 'SERVER', response.status);
  }

  if (!response.ok || !body.success) {
    const failure = body.success ? null : body;
    throw new ScannerApiError(
      failure?.error.message ?? 'The PC scanner rejected the request.',
      errorKind(response.status),
      response.status,
      failure?.error.code ?? null
    );
  }

  return body.data;
}

const jsonHeaders = { 'Content-Type': 'application/json' };
const sessionHeaders = (token: string) => ({ ...jsonHeaders, 'x-scanner-session': token });

export const scannerApi = {
  async testConnection(settings: ConnectionSettings): Promise<void> {
    const response = await fetchWithTimeout(`${scannerBaseUrl(settings)}/mobile-scanner`);
    if (!response.ok) {
      throw new ScannerApiError('The PC scanner answered, but is not ready.', 'SERVER', response.status);
    }
  },

  pair(settings: ConnectionSettings, code: string, deviceLabel?: string): Promise<PairingResult> {
    return requestJson(`${scannerBaseUrl(settings)}/api/v1/scanner/pair`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ code, ...(deviceLabel ? { deviceLabel } : {}) }),
    });
  },

  session(settings: ConnectionSettings, token: string): Promise<SessionResult> {
    return requestJson(`${scannerBaseUrl(settings)}/api/v1/scanner/session`, {
      headers: sessionHeaders(token),
    });
  },

  scan(settings: ConnectionSettings, token: string, code: string): Promise<ScanResult> {
    return requestJson(`${scannerBaseUrl(settings)}/api/v1/scanner/events`, {
      method: 'POST',
      headers: sessionHeaders(token),
      body: JSON.stringify(eventPayload(code)),
    });
  },
};
