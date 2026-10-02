import { ConnectionSettings } from '../types/scanner.types';
import { backendBaseUrl, requestJson } from './hc-client';

/**
 * Login + /auth/me contract exactly as the Electron frontend uses them. The
 * mobile client stores the returned access token in SecureStore and attaches
 * it as a Bearer header on every subsequent request. Refresh is deliberately
 * deferred to Phase 2: when the access token expires (~15 min on the backend
 * default), the mobile app sends the operator back to the login screen.
 */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'EMPLOYEE';
}

export async function login(connection: ConnectionSettings, body: LoginRequest): Promise<LoginResult> {
  const base = backendBaseUrl(connection);
  return requestJson<LoginResult>(`${base}/api/v1/auth/login`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchMe(connection: ConnectionSettings, token: string): Promise<AuthenticatedUser> {
  const base = backendBaseUrl(connection);
  return requestJson<AuthenticatedUser>(`${base}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
