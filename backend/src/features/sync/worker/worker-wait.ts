import type { SyncWorkerState } from '@prisma/client';
import { workerState } from './worker-settings';
import { decryptWorkerSecret } from './worker-secret';
import { businessClock, isOpening } from './worker-push';
import { syncWorker } from './worker-scheduler';

export interface WakeSignal { actions: boolean; refresh: boolean }

const WAIT_MS = 25000;
const CLOSED_CHECK_MS = 5 * 60000;

async function askRelay(state: SyncWorkerState, abort: AbortSignal): Promise<WakeSignal> {
  const signal = AbortSignal.any([abort, AbortSignal.timeout(WAIT_MS + 20000)]);
  // Refuse redirects: a relay address must never redirect the credential.
  const response = await fetch(`${state.relayUrl}/relay/v1/worker-wait?timeoutMs=${WAIT_MS}`, {
    redirect: 'error', signal,
    headers: { Authorization: `Bearer ${decryptWorkerSecret(state.workerSecretEncrypted!)}` },
  });
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Relay wait failed (${response.status})`);
  }
  const body = await response.json() as Partial<WakeSignal>;
  return { actions: body.actions === true, refresh: body.refresh === true };
}

const defaults = {
  state: workerState,
  ask: askRelay,
  quick: () => syncWorker.quick(),
  full: () => syncWorker.request(),
  clock: () => businessClock(),
  sleep: (ms: number, abort: AbortSignal) => new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    abort.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  }),
};
export type WaitDependencies = typeof defaults;

/**
 * During opening hours the PC keeps one request open at the relay. A phone
 * action answers it at once and the PC applies it in seconds; Refresh asks for
 * a full data push. The relay answers these from memory, so waiting costs no
 * Neon compute. It also keeps the free Render relay awake while the shop is
 * open, so phones no longer meet a 30-60 second cold start. After closing it
 * stops, and the regular hourly cycle takes over.
 */
export class RelayWaitLoop {
  private controller?: AbortController;
  private failures = 0;
  constructor(private readonly deps: WaitDependencies = defaults) {}
  start() {
    if (process.env.HOSTED_MODE === 'true' || this.controller) return;
    this.controller = new AbortController();
    void this.run(this.controller.signal);
  }
  stop() {
    this.controller?.abort();
    this.controller = undefined;
  }
  /** One step of the loop; returns how long to pause before the next one. */
  async step(abort: AbortSignal): Promise<number> {
    try {
      const state = await this.deps.state();
      if (!state.enabled || !state.relayUrl || !state.workerSecretEncrypted || !state.snapshotDone) return CLOSED_CHECK_MS;
      const start = state.openingStart.toISOString().slice(11, 16), end = state.openingEnd.toISOString().slice(11, 16);
      if (!isOpening(start, end, this.deps.clock())) return CLOSED_CHECK_MS;
      const signal = await this.deps.ask(state, abort);
      this.failures = 0;
      if (signal.refresh) this.deps.full();
      else if (signal.actions) this.deps.quick();
      return 0;
    } catch {
      if (abort.aborted) return 0;
      // Relay asleep, offline or restarting: back off up to 5 minutes.
      this.failures++;
      return Math.min(5 * 60000, 5000 * 2 ** Math.min(this.failures, 6));
    }
  }
  private async run(abort: AbortSignal) {
    while (!abort.aborted) {
      const pause = await this.step(abort);
      if (pause > 0 && !abort.aborted) await this.deps.sleep(pause, abort);
    }
  }
}
export const relayWaitLoop = new RelayWaitLoop();
