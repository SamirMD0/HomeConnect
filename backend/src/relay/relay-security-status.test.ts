import { describe, it, expect, vi } from 'vitest';
import { RelayStore } from './store';
import type { RelayClient } from './client';
describe('device security metadata persistence', () => {
  it('updates only the authenticated active device and includes status in the public PC list', async () => {
    const updateMany = vi.fn(),
      findMany = vi.fn(async () => [
        { id: 'device', pinSet: true, lastUnlockAt: new Date('2026-11-17T12:00:00Z') },
      ]);
    const store = new RelayStore({
      relayDevice: { updateMany, findMany },
    } as unknown as RelayClient);
    await store.deviceStatus('device', { pinSet: true, lastUnlockAt: '2026-11-17T12:00:00Z' });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'device', revokedAt: null },
      data: { pinSet: true, lastUnlockAt: new Date('2026-11-17T12:00:00Z') },
    });
    expect(await store.devices()).toEqual([
      { id: 'device', pinSet: true, lastUnlockAt: new Date('2026-11-17T12:00:00Z') },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ pinSet: true, lastUnlockAt: true }),
      })
    );
  });
});
