import { PrismaClient, type SyncWorkerState, type Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { workerState } from './worker-settings';
import { decryptWorkerSecret } from './worker-secret';
import { onWorkerRequest } from './worker-control';
import { CycleExpired, RelayFailure, WorkerRelay } from './relay-client';
import { businessClock, isOpening, pushRecords, refreshCustomerDates } from './worker-push';
import { applyClaimedActions } from './worker-actions';
import { snapshotCursor, sourcePage, systemScope } from './worker-source';
import { readChanges } from '../sync-feed.service';
import { pushFigures } from './worker-figures';

let lockClient: PrismaClient | undefined;
async function withWorkerLock(work: () => Promise<void>) {
  if (!lockClient) {
    // A separate one-connection pool keeps the network lease out of the counter's pool.
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('connection_limit', '1');
    lockClient = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  }
  await lockClient.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(74103, 2) AS locked`;
    if (rows[0]?.locked) await work();
  }, { timeout: 125000, maxWait: 1000 });
}

const defaults = {
  state: workerState, withLock: withWorkerLock,
  save: (data: Prisma.SyncWorkerStateUpdateInput, state?: SyncWorkerState) => prisma.syncWorkerState.updateMany({
    where: { id: 1, ...(state ? { enabled: true, relayUrl: state.relayUrl, workerSecretEncrypted: state.workerSecretEncrypted } : {}) }, data,
  }),
  push: pushRecords, refresh: refreshCustomerDates, figures: pushFigures, apply: applyClaimedActions,
  relay: (state: SyncWorkerState, deadline: number) => new WorkerRelay(state.relayUrl!, decryptWorkerSecret(state.workerSecretEncrypted!), deadline),
};
export type SchedulerDependencies = typeof defaults;
export function syncInterval(state: SyncWorkerState, clock = businessClock()) {
  const start = state.openingStart.toISOString().slice(11, 16), end = state.openingEnd.toISOString().slice(11, 16);
  if (isOpening(start, end, clock)) return 10 * 60000;
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const untilOpen = (minutes(start) - minutes(clock) + 1440) % 1440;
  return Math.min(60, untilOpen || 60) * 60000;
}

export class SyncWorkerScheduler {
  private running = false;
  private stopped = true;
  private queued = false;
  private timer?: ReturnType<typeof setTimeout>;
  private failures = 0;
  constructor(private readonly deps = defaults) {}
  start() {
    if (process.env.HOSTED_MODE === 'true' || !this.stopped) return;
    this.stopped = false;
    onWorkerRequest(() => this.request());
    this.request();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    onWorkerRequest(() => {});
  }
  request() {
    if (this.stopped || process.env.HOSTED_MODE === 'true') return;
    clearTimeout(this.timer);
    if (this.running) { this.queued = true; return; }
    // The handler returns before any database/network work begins.
    setImmediate(() => void this.cycle());
  }
  async cycle() {
    if (this.running || this.stopped || process.env.HOSTED_MODE === 'true') return;
    this.running = true;
    let state: SyncWorkerState | undefined;
    let delay = 60000;
    try {
      state = await this.deps.state();
      if (!state.enabled || !state.relayUrl || !state.workerSecretEncrypted) { delay = 0; return; }
      delay = syncInterval(state);
      await this.deps.withLock(async () => {
        // Re-read after the cross-process lock: another instance may have advanced.
        state = await this.deps.state();
        if (!state.enabled || !state.relayUrl || !state.workerSecretEncrypted) return;
        const config = state;
        const deadline = Date.now() + 120000;
        const save = async (data: Prisma.SyncWorkerStateUpdateInput) => {
          if ((await this.deps.save(data, config)).count === 0) throw new CycleExpired();
          return this.deps.state();
        };
        await save({ lastCycleAt: new Date() });
        const relay = this.deps.relay(state, deadline);
        const sources = { cursor: snapshotCursor, page: sourcePage, scope: systemScope, save, feed: readChanges };
        const caughtUp = await this.deps.push(state, relay, deadline - 25000, sources);
        state = await this.deps.state();
        if (!state.enabled || state.relayUrl !== config.relayUrl || state.workerSecretEncrypted !== config.workerSecretEncrypted) return;
        if (caughtUp && state.snapshotDone) await this.deps.refresh(state, relay, deadline - 15000, sources);
        if (caughtUp && state.snapshotDone && Date.now()<deadline-15000) await this.deps.figures(state,relay,deadline-15000);
        if (Date.now() < deadline) await this.deps.apply(relay, deadline);
        await save({ ...(caughtUp ? { lastSuccessAt: new Date() } : {}), lastError: null });
        this.failures = 0;
      });
    } catch (error) {
      if (!(error instanceof CycleExpired)) {
        this.failures++;
        delay = Math.min(30 * 60000, 60000 * 2 ** Math.min(this.failures, 5));
        const message = error instanceof RelayFailure && error.status === 401
          ? 'The relay rejected the worker secret. Check the saved secret in Settings.'
          : 'Cloud sync could not finish. It will retry automatically. Check the relay address and internet connection.';
        // Never persist raw exceptions: fetch/SQL errors may contain credentials or data.
        await this.deps.save({ lastError: message }, state).catch(() => {});
      }
    } finally {
      this.running = false;
      if (!this.stopped) {
        if (this.queued) { this.queued = false; this.request(); }
        else if (delay > 0) {
          this.timer = setTimeout(() => this.request(), delay);
          this.timer.unref();
        }
      }
    }
  }
}
export const syncWorker = new SyncWorkerScheduler();
