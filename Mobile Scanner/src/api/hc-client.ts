import { handleBranchRejection, selectedBranchHeaders } from '../branches/branch-selection';
import { ApiFailure, ApiSuccess, ConnectionSettings } from '../types/scanner.types';
import { accessTokenNeedsRefresh } from '../utils/jwt-expiry';

/**
 * Account-authenticated HTTP client for the approved /api/v1/* routes on the
 * Scanner Hub LAN listener. Uses the same JWT as the Electron frontend; the
 * legacy browser scanner uses a separate pairing token.
 */

const REQUEST_TIMEOUT_MS = 10_000;

interface SessionRecovery {
  baseUrl: string;
  getToken(): string | null;
  refresh(): Promise<string | null>;
  signOut(): Promise<void>;
  onConnectionChange?(online: boolean): void;
}
let sessionRecovery: SessionRecovery | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let foregroundCheckPending = true;
export function configureApiSession(recovery: SessionRecovery | null) {
  sessionRecovery = recovery;
  refreshInFlight = null;
  foregroundCheckPending = true;
}
async function recoverSession(): Promise<string | null> {
  if (!sessionRecovery?.getToken()) return null;
  if (refreshInFlight) return refreshInFlight;
  const session = sessionRecovery;
  const originalToken = session.getToken();
  const pending = (async () => {
    let token: string | null = null;
    try {
      token = await session.refresh();
    } catch (error) {
      if (sessionRecovery !== session) return null;
      if (error instanceof HcApiError && error.status === 401) {
        if (session.getToken() === originalToken) await session.signOut();
        return null;
      }
      if (
        error instanceof HcApiError &&
        (error.kind === 'NETWORK' || error.code === 'DESKTOP_UNAVAILABLE')
      )
        session.onConnectionChange?.(false);
      // Connectivity, throttling and server errors do not revoke credentials.
      foregroundCheckPending = true;
      throw error;
    }
    if (sessionRecovery !== session) return null;
    if (!token && session.getToken() === originalToken) await session.signOut();
    if (token) session.onConnectionChange?.(true);
    return token;
  })().finally(() => {
    if (refreshInFlight === pending) refreshInFlight = null;
  });
  refreshInFlight = pending;
  return pending;
}

function pendingSessionRefresh(): Promise<string | null> | null {
  if (!sessionRecovery?.getToken()) return null;
  if (refreshInFlight) return refreshInFlight;
  if (!foregroundCheckPending) return null;
  foregroundCheckPending = false;
  return accessTokenNeedsRefresh(sessionRecovery.getToken()!) ? recoverSession() : null;
}

/** A foreground barrier shared by JSON requests and the unchanged native bill uploader. */
export async function prepareApiSession(expectedBaseUrl?: string): Promise<string | null> {
  const session = sessionRecovery;
  if (!session || (expectedBaseUrl && expectedBaseUrl !== session.baseUrl)) return null;
  const pending = pendingSessionRefresh();
  if (pending) await pending;
  return sessionRecovery === session ? session.getToken() : null;
}

export function markSessionForForegroundCheck() {
  foregroundCheckPending = true;
}
export const refreshApiSession = () => recoverSession();

export type HcApiErrorKind =
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'VALIDATION'
  | 'NETWORK'
  | 'SERVER'
  | 'TOO_LARGE'
  | 'NOT_FOUND'
  | 'BRANCH';

export class HcApiError extends Error {
  constructor(
    message: string,
    public readonly kind: HcApiErrorKind,
    public readonly status: number | null = null,
    public readonly code: string | null = null
  ) {
    super(message);
    this.name = 'HcApiError';
  }
}

function errorKind(status: number): HcApiErrorKind {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 413) return 'TOO_LARGE';
  if (status === 404) return 'NOT_FOUND';
  if (status === 403 || status === 409) return 'BRANCH';
  if (status >= 400 && status < 500) return 'VALIDATION';
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
      'NETWORK'
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One-shot request helper. Treats the server's `{ success, data }` envelope as
 * the contract and normalises network / 4xx / 5xx failures into `HcApiError`.
 */
export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  skipRecovery = false,
  onResponse?: (response: Response) => void
): Promise<T> {
  const recovery = sessionRecovery;
  const sentToken = (init.headers as Record<string, string> | undefined)?.Authorization?.slice(7);
  const belongsToSession = Boolean(
    recovery &&
    sentToken &&
    sentToken === recovery.getToken() &&
    url.startsWith(`${recovery.baseUrl}/api/v1/`)
  );
  if (!skipRecovery && belongsToSession && recovery) {
    const pending = pendingSessionRefresh();
    if (pending) {
      await pending;
      if (sessionRecovery !== recovery || !recovery.getToken())
        throw new HcApiError('Session expired. Please sign in again.', 'UNAUTHORIZED', 401);
      init = {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${recovery.getToken()}` },
      };
    }
  }
  const branchHeaders = selectedBranchHeaders();
  const response = await fetchWithTimeout(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...branchHeaders,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  }).catch((error) => {
    if (belongsToSession && sessionRecovery === recovery) recovery?.onConnectionChange?.(false);
    throw error;
  });
  if (belongsToSession && sessionRecovery === recovery && response.status !== 502)
    recovery?.onConnectionChange?.(true);

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // Non-JSON body — fall through to the generic handling below.
  }

  try {
    const result = parseJsonEnvelope<T>(
      response.status,
      parsed,
      branchHeaders['X-Branch-Scope'] ?? null,
      false
    );
    onResponse?.(response);
    return result;
  } catch (error) {
    const authorized = Boolean((init.headers as Record<string, string> | undefined)?.Authorization);
    if (
      response.status === 401 &&
      authorized &&
      !skipRecovery &&
      recovery &&
      belongsToSession &&
      sessionRecovery === recovery &&
      url.startsWith(`${recovery.baseUrl}/api/v1/`)
    ) {
      const sentToken = ((init.headers as Record<string, string>).Authorization ?? '').slice(7);
      const currentToken = recovery.getToken();
      const token =
        currentToken && currentToken !== sentToken ? currentToken : await recoverSession();
      if (token && sessionRecovery === recovery) {
        try {
          return await requestJson<T>(
            url,
            { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } },
            true,
            onResponse
          );
        } catch (retryError) {
          if (
            retryError instanceof HcApiError &&
            retryError.status === 401 &&
            sessionRecovery === recovery &&
            recovery.getToken() === token
          )
            await recovery.signOut();
          throw retryError;
        }
      }
    }
    throw error;
  }
}

/** Shared by JSON requests and native binary uploads. */
export function parseJsonEnvelope<T>(
  status: number,
  parsed: unknown,
  sentBranch: string | null,
  notifySession = true
): T {
  if (
    status >= 200 &&
    status < 300 &&
    parsed &&
    typeof parsed === 'object' &&
    (parsed as ApiSuccess<T>).success === true
  ) {
    return (parsed as ApiSuccess<T>).data;
  }
  const failure = parsed as ApiFailure | null;
  const code = failure?.error?.code ?? null;
  const message = failure?.error?.message ?? defaultMessage(status);
  handleBranchRejection(status, code, sentBranch);
  if (status === 401 && notifySession && sessionRecovery?.getToken())
    void recoverSession().catch(() => undefined);
  throw new HcApiError(message, errorKind(status), status, code);
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
  return { Authorization: `Bearer ${client.token}`, ...selectedBranchHeaders() };
}
