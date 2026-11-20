import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncEngine } from './sync-engine';
import {
  PC_REFRESH_FOLLOW_UP_MS,
  PC_REFRESH_MIN_MS,
  refreshFromUser,
  resetUserRefreshThrottle,
  setSyncEngine,
} from './sync-status';

const engine = {
  getStatus: () => ({ syncing: false, lastSyncAt: null, error: null }),
  subscribe: () => () => {},
  request: vi.fn(async () => {}),
  sync: vi.fn(async () => {}),
  askPcForFreshData: vi.fn(async () => true),
};

describe('pull-to-refresh asks the shop PC for fresh data', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetUserRefreshThrottle();
    setSyncEngine(engine as unknown as SyncEngine);
  });
  afterEach(() => {
    setSyncEngine(null);
    vi.useRealTimers();
  });

  it('syncs now, asks the PC, and reads again once the PC has pushed', async () => {
    const T = 1_000_000;
    await refreshFromUser(T);
    expect(engine.request).toHaveBeenCalledTimes(1);
    expect(engine.askPcForFreshData).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PC_REFRESH_FOLLOW_UP_MS);
    expect(engine.request).toHaveBeenCalledTimes(2);
  });

  it('asks the PC at most every 2 minutes, while plain syncs keep their 30 s limit', async () => {
    const T = 1_000_000;
    await refreshFromUser(T);
    await refreshFromUser(T + 30_000);
    expect(engine.askPcForFreshData).toHaveBeenCalledTimes(1);
    expect(engine.request).toHaveBeenCalledTimes(2);
    await refreshFromUser(T + PC_REFRESH_MIN_MS);
    expect(engine.askPcForFreshData).toHaveBeenCalledTimes(2);
  });

  it('skips the follow-up read when the relay could not be asked', async () => {
    engine.askPcForFreshData.mockResolvedValueOnce(false);
    await refreshFromUser(1_000_000);
    await vi.advanceTimersByTimeAsync(PC_REFRESH_FOLLOW_UP_MS);
    expect(engine.request).toHaveBeenCalledTimes(1);
  });
});
