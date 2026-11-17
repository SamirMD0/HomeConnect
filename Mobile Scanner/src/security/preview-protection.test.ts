import { describe, it, expect, vi } from 'vitest';
const capture = vi.hoisted(() => ({
  preventScreenCaptureAsync: vi.fn(),
  allowScreenCaptureAsync: vi.fn(),
  enableAppSwitcherProtectionAsync: vi.fn(),
  disableAppSwitcherProtectionAsync: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-screen-capture', () => capture);
import { protectCloudPreview } from './preview-protection';
describe('native preview protection', () => {
  it('keeps protection during pairing handover and releases only after the final lease', async () => {
    const first = await protectCloudPreview(),
      second = await protectCloudPreview();
    const keys = capture.preventScreenCaptureAsync.mock.calls.map((call) => call[0]);
    expect(keys[0]).not.toBe(keys[1]);
    await first();
    expect(capture.disableAppSwitcherProtectionAsync).not.toHaveBeenCalled();
    await second();
    expect(capture.disableAppSwitcherProtectionAsync).toHaveBeenCalledOnce();
    expect(capture.allowScreenCaptureAsync.mock.calls.map((call) => call[0])).toEqual(keys);
    await second();
    expect(capture.disableAppSwitcherProtectionAsync).toHaveBeenCalledOnce();
  });
});
