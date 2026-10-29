import { ConnectionSettings } from '../types/scanner.types';
import { backendBaseUrl, HcApiError, requestJson } from './hc-client';

/**
 * Login + /auth/me contract exactly as the Electron frontend uses them. The
 * mobile client stores the returned access token in SecureStore and attaches
 * it as a Bearer header on every subsequent request. Refresh is deliberately
 * deferred to Phase 2: when the access token expires (~15 min on the backend
 * default), the mobile app sends the operator back to the login screen.
 */

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'EMPLOYEE';
}

function explainMissingAuthentication(error: unknown): never {
  if (error instanceof HcApiError && error.status === 404) {
    throw new HcApiError(
      'This PC does not support mobile sign-in. Install the updated HomeConnect desktop build, reopen it, and turn on Mobile Scanner in Scanner Hub.',
      'SERVER',
      404,
      'MOBILE_AUTH_UNAVAILABLE',
    );
  }
  throw error;
}

/** Probe the account route without credentials or a login attempt. */
export async function testBackendConnection(connection: ConnectionSettings): Promise<void> {
  try {
    await fetchMe(connection, '');
  } catch (error) {
    // A protected route answering 401 confirms that mobile sign-in is exposed.
    if (error instanceof HcApiError && error.status === 401) return;
    explainMissingAuthentication(error);
  }
}

export async function login(connection: ConnectionSettings, body: LoginRequest): Promise<LoginResult> {
  const base = backendBaseUrl(connection);
  try {
    return await requestJson<LoginResult>(`${base}/api/v1/auth/login`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (error) {
    explainMissingAuthentication(error);
  }
}

export async function fetchMe(connection: ConnectionSettings, token: string): Promise<AuthenticatedUser> {
  const base = backendBaseUrl(connection);
  return requestJson<AuthenticatedUser>(`${base}/api/v1/auth/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
