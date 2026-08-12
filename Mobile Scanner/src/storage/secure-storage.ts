import * as SecureStore from 'expo-secure-store';
import { ConnectionSettings } from '../types/scanner.types';
import { parseConnection } from '../utils/scanner-url';

const CONNECTION_KEY = 'homeconnect.scanner.connection.v1';
const SESSION_TOKEN_KEY = 'homeconnect.scanner.session-token.v1';

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
