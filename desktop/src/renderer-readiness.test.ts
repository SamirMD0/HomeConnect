import { describe, expect, it, vi, afterEach } from 'vitest';
import { waitForRendererReady } from './renderer-readiness';
afterEach(() => vi.useRealTimers());
describe('first screen readiness', () => {
  it('waits beyond loaded HTML until React renders a real screen', async () => {
    const executeJavaScript = vi.fn().mockResolvedValueOnce({ ready: false, failed: false }).mockResolvedValue({ ready: true, failed: false });
    await waitForRendererReady({ executeJavaScript }, 2000);
    expect(executeJavaScript).toHaveBeenCalledTimes(2);
  });
  it('rejects a caught React failure so the update can roll back', async () => {
    await expect(waitForRendererReady({ executeJavaScript: vi.fn().mockResolvedValue({ ready: true, failed: true }) }, 1000))
      .rejects.toThrow('failed to render');
  });
  it('rejects a screen that remains blank instead of committing the update', async () => {
    vi.useFakeTimers();
    const outcome = waitForRendererReady({ executeJavaScript: vi.fn().mockResolvedValue({ ready: false, failed: false }) }, 1000);
    const checked = expect(outcome).rejects.toThrow('did not become ready');
    await vi.advanceTimersByTimeAsync(1100);
    await checked;
  });
});
