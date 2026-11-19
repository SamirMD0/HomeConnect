import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncWorkerState } from '@prisma/client';
import { SyncWorkerScheduler, syncInterval, type SchedulerDependencies } from './worker-scheduler';
import { RelayFailure } from './relay-client';

const deps = { state: vi.fn(), withLock: vi.fn(), save: vi.fn(), push: vi.fn(), refresh: vi.fn(), figures: vi.fn(), apply: vi.fn(), relay: vi.fn() };
let scheduler: SyncWorkerScheduler;
const state = { enabled: true, relayUrl: 'https://relay.example', workerSecretEncrypted: 'private-ciphertext',
  openingStart: new Date('1970-01-01T07:00:00Z'), openingEnd: new Date('1970-01-01T22:00:00Z'), snapshotDone: true } as SyncWorkerState;
describe('worker scheduling and isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.resetAllMocks();
    deps.state.mockResolvedValue({ ...state });
    deps.withLock.mockImplementation(async work => work());
    deps.save.mockResolvedValue({ count: 1 });
    deps.push.mockResolvedValue(true);
    deps.relay.mockReturnValue({ request: vi.fn() });
    scheduler = new SyncWorkerScheduler(deps as SchedulerDependencies);
  });
  afterEach(() => { scheduler.stop(); vi.useRealTimers(); delete process.env.HOSTED_MODE; });
  it('does no work in hosted mode or with disabled settings', async () => {
    process.env.HOSTED_MODE = 'true';
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.state).not.toHaveBeenCalled();
    delete process.env.HOSTED_MODE;
    deps.state.mockResolvedValue({ ...state, enabled: false });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.withLock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('uses the required cadence, including overnight opening hours', () => {
    // 15 minutes by default (Neon free plan budget), hourly outside opening hours.
    expect(syncInterval(state, '08:00')).toBe(900000);
    expect(syncInterval(state, '02:00')).toBe(3600000);
    expect(syncInterval(state, '06:55')).toBe(300000);
    expect(syncInterval({ ...state, openingStart: state.openingEnd, openingEnd: state.openingStart }, '23:00')).toBe(900000);
  });
  it('follows the Sync every setting, and falls back to 15 minutes on any other value', () => {
    expect(syncInterval({ ...state, syncMinutes: 10 }, '08:00')).toBe(600000);
    expect(syncInterval({ ...state, syncMinutes: 15 }, '08:00')).toBe(900000);
    expect(syncInterval({ ...state, syncMinutes: 30 }, '08:00')).toBe(1800000);
    expect(syncInterval({ ...state, syncMinutes: 5 }, '08:00')).toBe(900000);
    expect(syncInterval({ ...state, syncMinutes: 30 }, '02:00')).toBe(3600000);
  });
  it('only starts one cycle in process and only works inside the database lock', async () => {
    let release!: () => void;
    deps.push.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await scheduler.cycle();
    expect(deps.push).toHaveBeenCalledOnce();
    expect(deps.apply).not.toHaveBeenCalled();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.apply).toHaveBeenCalledOnce();
    expect(deps.withLock).toHaveBeenCalledOnce();
  });
  it('does not call the relay when another process owns the advisory lock', async () => {
    deps.withLock.mockResolvedValue(undefined);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.relay).not.toHaveBeenCalled();
  });
  it('uses a two-minute deadline, redacts failure text, and backs off', async () => {
    deps.push.mockRejectedValue(new Error('private-secret and private payload'));
    const start = Date.now();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.relay.mock.calls[0][1]).toBe(start + 120000);
    expect(JSON.stringify(deps.save.mock.calls.map(call => call[0]))).not.toContain('private-secret');
    expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ lastError: expect.stringContaining('retry automatically') }), expect.any(Object));
    await vi.advanceTimersByTimeAsync(119999);
    expect(deps.push).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2);
    expect(deps.push).toHaveBeenCalledTimes(2);
    deps.push.mockRejectedValue(new RelayFailure(401));
    scheduler.request();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.save).toHaveBeenLastCalledWith(expect.objectContaining({ lastError: expect.stringContaining('Check the saved secret') }), expect.any(Object));
  });
});
