import * as SecureStore from 'expo-secure-store';
import { ConnectionSettings } from '../types/scanner.types';
import { parseConnection } from '../utils/scanner-url';

const CONNECTION_KEY = 'homeconnect.scanner.connection.v1';
const SESSION_TOKEN_KEY = 'homeconnect.scanner.session-token.v1';
const AUTH_TOKEN_KEY = 'homeconnect.scanner.auth-access-token.v1';
const AUTH_USER_KEY = 'homeconnect.scanner.auth-user.v1';

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function requireSecureStorage(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure device storage is unavailable. The scanner cannot safely store its session.');
  }
}

export async function loadConnection(): Promise<ConnectionSettings | null> {
  const stored = await SecureStore.getItemAsync(CONNECTION_KEY, secureOptions);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<ConnectionSettings>;
    const validation = parseConnection(String(parsed.host ?? ''), String(parsed.port ?? ''));
    if (validation.ok) return validation.value;
  } catch {
    // Corrupt settings are removed below and re-entered by the operator.
  }

  await SecureStore.deleteItemAsync(CONNECTION_KEY, secureOptions);
  return null;
}

export async function saveConnection(settings: ConnectionSettings): Promise<void> {
  await SecureStore.setItemAsync(CONNECTION_KEY, JSON.stringify(settings), secureOptions);
}

export const loadSessionToken = () => SecureStore.getItemAsync(SESSION_TOKEN_KEY, secureOptions);
export const saveSessionToken = (token: string) => SecureStore.setItemAsync(SESSION_TOKEN_KEY, token, secureOptions);
export const clearSessionToken = () => SecureStore.deleteItemAsync(SESSION_TOKEN_KEY, secureOptions);

// --- Direct-API auth (Phase 1): access token + authenticated user ------------
// Written on successful /auth/login. On a 401 against /api/v1/*, both are
// cleared and the operator is routed back to the LoginScreen.

export interface StoredAuthUser {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'EMPLOYEE';
}

export const loadAuthToken = () => SecureStore.getItemAsync(AUTH_TOKEN_KEY, secureOptions);
export const saveAuthToken = (token: string) =>
  SecureStore.setItemAsync(AUTH_TOKEN_KEY, token, secureOptions);
export const clearAuthToken = () => SecureStore.deleteItemAsync(AUTH_TOKEN_KEY, secureOptions);

export async function loadAuthUser(): Promise<StoredAuthUser | null> {
  const stored = await SecureStore.getItemAsync(AUTH_USER_KEY, secureOptions);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as StoredAuthUser;
    if (parsed && parsed.id && parsed.email && parsed.fullName && parsed.role) return parsed;
  } catch {
    // Corrupt — fall through and drop it.
  }
  await SecureStore.deleteItemAsync(AUTH_USER_KEY, secureOptions);
  return null;
}

export const saveAuthUser = (user: StoredAuthUser) =>
  SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(user), secureOptions);
export const clearAuthUser = () => SecureStore.deleteItemAsync(AUTH_USER_KEY, secureOptions);

export async function clearAllAuth(): Promise<void> {
  await Promise.all([clearAuthToken(), clearAuthUser()]);
}
