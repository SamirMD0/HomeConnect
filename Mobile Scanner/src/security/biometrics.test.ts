import { beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({
  hasHardwareAsync: vi.fn(),
  isEnrolledAsync: vi.fn(),
  authenticateAsync: vi.fn(),
}));
vi.mock('expo-local-authentication', () => native);
import { authenticateBiometric, hasBiometrics } from './biometrics';
beforeEach(() => {
  vi.resetAllMocks();
  native.hasHardwareAsync.mockResolvedValue(true);
  native.isEnrolledAsync.mockResolvedValue(true);
});
describe('biometric PIN fallback', () => {
  it('uses enrolled strong biometrics without the OS device-passcode fallback', async () => {
    native.authenticateAsync.mockResolvedValue({ success: true });
    expect(await authenticateBiometric()).toBe(true);
    expect(native.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ disableDeviceFallback: true, biometricsSecurityLevel: 'strong' })
    );
  });
  it('returns to PIN on cancel or without enrollment', async () => {
    native.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
    expect(await authenticateBiometric()).toBe(false);
    native.isEnrolledAsync.mockResolvedValue(false);
    expect(await hasBiometrics()).toBe(false);
  });
});
