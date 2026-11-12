import type { AccountUser } from '@shared/mobile-contracts';
import { checkClientCompatibility } from './system-api';
import { ConnectionSettings } from '../types/scanner.types';
import { backendBaseUrl, HcApiError, requestJson } from './hc-client';

/**
 * Login + /auth/me contract exactly as the Electron frontend uses them. The
 * mobile client stores the returned access token in SecureStore and attaches
 * it as a Bearer header on subsequent requests. The LAN gateway translates the
 * desktop refresh cookie to X-Refresh-Token for device-only secure storage and
 * back to a cookie only on refresh/logout. Refresh is single-flight; network
 * failures keep the session, while rejected refresh credentials end it.
 */

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  user: AuthenticatedUser;
  refreshToken?: string | null;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string | null;
}

export type AuthenticatedUser = AccountUser;

function explainMissingAuthentication(error: unknown): never {
  if (error instanceof HcApiError && error.status === 404) {
    throw new HcApiError(
      'This PC does not support mobile sign-in. Install the updated HomeConnect desktop build, reopen it, and turn on Mobile Scanner in Scanner Hub.',
      'SERVER',
      404,
      'MOBILE_AUTH_UNAVAILABLE'
    );
  }
  throw error;
}

/** The public, cheap handshake works before a session exists on the LAN. */
export async function testBackendConnection(connection: ConnectionSettings): Promise<void> {
  await checkClientCompatibility(connection);
}

export async function login(
  connection: ConnectionSettings,
  body: LoginRequest
): Promise<LoginResult> {
  const base = backendBaseUrl(connection);
  try {
    let refreshToken: string | null = null;
    const result = await requestJson<LoginResult>(
      `${base}/api/v1/auth/login`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      false,
      (response) => {
        refreshToken = response.headers?.get('X-Refresh-Token') ?? null;
      }
    );
    return { ...result, refreshToken };
  } catch (error) {
    explainMissingAuthentication(error);
  }
}

export async function refreshSession(
  connection: ConnectionSettings,
  accessToken: string,
  refreshToken: string | null
): Promise<RefreshResult> {
  let rotated: string | null = null;
  try {
    const result = await requestJson<{ accessToken: string }>(
      `${backendBaseUrl(connection)}/api/v1/auth/refresh`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(refreshToken ? { 'X-Refresh-Token': refreshToken } : {}),
        },
      },
      true,
      (response) => {
        rotated = response.headers?.get('X-Refresh-Token') ?? null;
      }
    );
    if (!result?.accessToken)
      throw new HcApiError('Invalid refresh response. Try again.', 'SERVER');
    return { accessToken: result.accessToken, refreshToken: rotated };
  } catch (error) {
    if (error instanceof HcApiError && error.status === 204)
      throw new HcApiError('Please sign in again to renew this session.', 'UNAUTHORIZED', 401);
    throw error;
  }
}

export async function logoutSession(
  connection: ConnectionSettings,
  accessToken: string,
  refreshToken: string | null
): Promise<void> {
  // Logout's desktop envelope has no data; only HTTP success matters here.
  await requestJson(
    `${backendBaseUrl(connection)}/api/v1/auth/logout`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(refreshToken ? { 'X-Refresh-Token': refreshToken } : {}),
      },
    },
    true
  );
}

export async function fetchMe(
  connection: ConnectionSettings,
  token: string
): Promise<AuthenticatedUser> {
  const base = backendBaseUrl(connection);
  return requestJson<AuthenticatedUser>(`${base}/api/v1/auth/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
