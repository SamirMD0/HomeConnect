import { beforeEach, describe, expect, it, vi } from 'vitest';
const secure = vi.hoisted(() => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
vi.mock('expo-secure-store', () => secure);
import { clearCloudPairing, loadCloudPairing, saveCloudPairing } from './cloud-storage';
import type { CloudPairing } from './cloud-pairing';
const pairing: CloudPairing = { v: 1, relay: 'https://relay.example', deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', userName: 'Mira', role: 'EMPLOYEE', token: 'x'.repeat(43), branchIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'] };
describe('device-only cloud pairing storage', () => {
  beforeEach(() => vi.clearAllMocks());
  it('saves and restores the user and device token only through SecureStore', async () => {
    await saveCloudPairing(pairing);
    const [key, value, options] = secure.setItemAsync.mock.calls[0]!;
    expect(options).toEqual({ keychainAccessible: 'device-only' });
    expect(JSON.parse(value)).toMatchObject({ token: pairing.token, user: { id: pairing.userId, fullName: 'Mira' } });
    secure.getItemAsync.mockResolvedValue(value);
    expect(await loadCloudPairing()).toEqual(pairing);
    await clearCloudPairing(); expect(secure.deleteItemAsync).toHaveBeenCalledWith(key, options);
  });
  it('drops corrupt credentials so they cannot start a cloud session', async () => {
    secure.getItemAsync.mockResolvedValue('{invalid');
    expect(await loadCloudPairing()).toBeNull();
    expect(secure.deleteItemAsync).toHaveBeenCalledOnce();
  });
  it('persists a refreshed role and an empty branch grant without reviving an old scope', async () => {
    const refreshed = { ...pairing, role: 'ADMIN' as const, branchIds: [] };
    await saveCloudPairing(refreshed);
    secure.getItemAsync.mockResolvedValue(secure.setItemAsync.mock.calls[0]![1]);
    expect(await loadCloudPairing()).toEqual(refreshed);
  });
});
