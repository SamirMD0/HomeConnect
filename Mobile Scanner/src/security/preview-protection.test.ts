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
  it('allows screenshots and hides the iOS app switcher until the final lease ends', async () => {
    const first = await protectCloudPreview(),
      second = await protectCloudPreview();
    // Screenshots stay allowed by the owner's decision (2026-11-24).
    expect(capture.preventScreenCaptureAsync).not.toHaveBeenCalled();
    expect(capture.enableAppSwitcherProtectionAsync).toHaveBeenCalledOnce();
    await first();
    expect(capture.disableAppSwitcherProtectionAsync).not.toHaveBeenCalled();
    await second();
    expect(capture.disableAppSwitcherProtectionAsync).toHaveBeenCalledOnce();
    const keys = capture.allowScreenCaptureAsync.mock.calls.map((call) => call[0]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    await second();
    expect(capture.disableAppSwitcherProtectionAsync).toHaveBeenCalledOnce();
  });
});
