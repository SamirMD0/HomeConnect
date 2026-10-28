import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSelectedBranch, loadSelectedBranch, saveSelectedBranch } from './branch-storage';
import { selectedBranchHeaders, setSelectedBranch } from './branch-selection';
import { clearAllAuth } from '../storage/secure-storage';
const storage = vi.hoisted(() => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
vi.mock('expo-secure-store', () => storage);
beforeEach(() => { vi.clearAllMocks(); setSelectedBranch(null); });
describe('secure branch storage', () => {
  it('persists branch selection using the existing device-only secure storage', async () => {
    await saveSelectedBranch('a');
    expect(storage.setItemAsync).toHaveBeenCalledWith('homeconnect.scanner.selected-branch.v1', 'a', { keychainAccessible: 'device-only' });
    storage.getItemAsync.mockResolvedValue('a'); expect(await loadSelectedBranch()).toBe('a');
    expect(selectedBranchHeaders()).toEqual({ 'X-Branch-Scope': 'a' });
  });
  it('clears persisted and in-memory selection on access rejection', async () => {
    await saveSelectedBranch('a'); await clearSelectedBranch();
    expect(selectedBranchHeaders()).toEqual({});
    expect(storage.deleteItemAsync).toHaveBeenCalledWith('homeconnect.scanner.selected-branch.v1', { keychainAccessible: 'device-only' });
  });
  it('clears the selected branch together with authentication on logout', async () => {
    await saveSelectedBranch('a'); await clearAllAuth();
    expect(selectedBranchHeaders()).toEqual({});
    expect(storage.deleteItemAsync.mock.calls.map((call) => call[0])).toContain('homeconnect.scanner.selected-branch.v1');
    expect(storage.deleteItemAsync).toHaveBeenCalledTimes(3);
  });
});
