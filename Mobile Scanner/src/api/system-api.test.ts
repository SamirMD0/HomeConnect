import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkClientCompatibility } from './system-api';
afterEach(() => vi.unstubAllGlobals());
const connection = { host: 'pc', port: 3011 };
describe('startup compatibility over the PC LAN gateway', () => {
  it.each([
    ['2.1.0', '1.2.0', false, false],
    ['2.1.0', '1.5.0', true, false],
    ['2.0.0', '1.0.0', false, true],
  ])(
    'checks backend %s and minimum mobile %s',
    async (apiVersion, minMobileVersion, blocked, warning) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          json: async () => ({ success: true, data: { apiVersion, minMobileVersion } }),
        })
      );
      const state = await checkClientCompatibility(connection);
      expect(state.blocked).toBe(blocked);
      expect(Boolean(state.warning)).toBe(warning);
    }
  );
  it('warns for a PC predating the handshake and preserves network errors for retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ status: 404, json: async () => ({ success: false }) });
    vi.stubGlobal('fetch', fetch);
    expect((await checkClientCompatibility(connection)).warning).toContain('PC');
    fetch.mockRejectedValue(new Error('offline'));
    await expect(checkClientCompatibility(connection)).rejects.toMatchObject({ kind: 'NETWORK' });
  });
});
