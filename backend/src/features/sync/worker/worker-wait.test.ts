import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncWorkerState } from '@prisma/client';
import { RelayWaitLoop, type WaitDependencies } from './worker-wait';
import { SyncWorkerScheduler, type SchedulerDependencies } from './worker-scheduler';

const state = {
  enabled: true, relayUrl: 'https://relay.example', workerSecretEncrypted: 'ciphertext', snapshotDone: true,
  openingStart: new Date('1970-01-01T07:00:00Z'), openingEnd: new Date('1970-01-01T22:00:00Z'),
} as SyncWorkerState;
const deps = { state: vi.fn(), ask: vi.fn(), quick: vi.fn(), full: vi.fn(), clock: vi.fn(), sleep: vi.fn() };
const abort = new AbortController().signal;

describe('PC wait loop', () => {
  let loop: RelayWaitLoop;
  beforeEach(() => {
    vi.resetAllMocks();
    deps.state.mockResolvedValue({ ...state });
    deps.clock.mockReturnValue('10:00');
    deps.ask.mockResolvedValue({ actions: false, refresh: false });
    loop = new RelayWaitLoop(deps as unknown as WaitDependencies);
  });

  it('applies phone actions at once when the relay says they are waiting', async () => {
    deps.ask.mockResolvedValue({ actions: true, refresh: false });
    expect(await loop.step(abort)).toBe(0);
    expect(deps.quick).toHaveBeenCalledOnce();
    expect(deps.full).not.toHaveBeenCalled();
  });

  it('runs a full push when a phone asks for fresh data', async () => {
    deps.ask.mockResolvedValue({ actions: true, refresh: true });
    await loop.step(abort);
    expect(deps.full).toHaveBeenCalledOnce();
    expect(deps.quick).not.toHaveBeenCalled();
  });

  it('asks again straight away when nothing happened', async () => {
    expect(await loop.step(abort)).toBe(0);
    expect(deps.quick).not.toHaveBeenCalled();
  });

  it('stays away from the relay outside opening hours or before the first copy', async () => {
    deps.clock.mockReturnValue('23:30');
    expect(await loop.step(abort)).toBe(300000);
    deps.clock.mockReturnValue('10:00');
    deps.state.mockResolvedValue({ ...state, snapshotDone: false });
    expect(await loop.step(abort)).toBe(300000);
    deps.state.mockResolvedValue({ ...state, enabled: false });
    expect(await loop.step(abort)).toBe(300000);
    expect(deps.ask).not.toHaveBeenCalled();
  });

  it('backs off when the relay is unreachable, up to 5 minutes, and recovers', async () => {
    deps.ask.mockRejectedValue(new Error('offline'));
    const pauses = [];
    for (let i = 0; i < 8; i++) pauses.push(await loop.step(abort));
    expect(pauses.slice(0, 3)).toEqual([10000, 20000, 40000]);
    expect(Math.max(...pauses)).toBe(300000);
    deps.ask.mockResolvedValue({ actions: false, refresh: false });
    expect(await loop.step(abort)).toBe(0);
    deps.ask.mockRejectedValue(new Error('offline'));
    expect(await loop.step(abort)).toBe(10000);
  });
});

describe('quick cycle', () => {
  const schedulerDeps = { state: vi.fn(), withLock: vi.fn(), save: vi.fn(), push: vi.fn(), refresh: vi.fn(), figures: vi.fn(), apply: vi.fn(), relay: vi.fn() };
  let scheduler: SyncWorkerScheduler;
  beforeEach(() => {
    vi.resetAllMocks();
    schedulerDeps.state.mockResolvedValue({ ...state });
    schedulerDeps.withLock.mockImplementation(async (work) => work());
    schedulerDeps.save.mockResolvedValue({ count: 1 });
    schedulerDeps.push.mockResolvedValue(true);
    schedulerDeps.relay.mockReturnValue({ request: vi.fn() });
    scheduler = new SyncWorkerScheduler(schedulerDeps as SchedulerDependencies);
  });
  // Started and idle: let the start-up full cycle finish, then forget its calls.
  const started = async () => {
    scheduler.start();
    await vi.waitFor(() => expect(schedulerDeps.state).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    await new Promise((resolve) => setImmediate(resolve));
    for (const mock of Object.values(schedulerDeps)) mock.mockClear();
  };
  afterEach(() => scheduler.stop());

  it('applies actions first, then pushes the changed records, skipping figures', async () => {
    const order: string[] = [];
    schedulerDeps.apply.mockImplementation(async () => { order.push('apply'); });
    schedulerDeps.push.mockImplementation(async () => { order.push('push'); return true; });
    await started();
    order.length = 0; // forget the start-up full cycle
    await scheduler.quickCycle();
    expect(order).toEqual(['apply', 'push']);
    expect(schedulerDeps.figures).not.toHaveBeenCalled();
    expect(schedulerDeps.refresh).not.toHaveBeenCalled();
    expect(schedulerDeps.withLock).toHaveBeenCalledOnce();
  });

  it('does nothing when cloud sync is off', async () => {
    schedulerDeps.state.mockResolvedValue({ ...state, enabled: false });
    await started();
    await scheduler.quickCycle();
    expect(schedulerDeps.withLock).not.toHaveBeenCalled();
  });

  it('keeps quiet on failure and never records an error', async () => {
    schedulerDeps.apply.mockRejectedValue(new Error('relay down'));
    await started();
    schedulerDeps.apply.mockRejectedValue(new Error('relay down'));
    await expect(scheduler.quickCycle()).resolves.toBeUndefined();
    expect(schedulerDeps.save).not.toHaveBeenCalled();
  });
});
