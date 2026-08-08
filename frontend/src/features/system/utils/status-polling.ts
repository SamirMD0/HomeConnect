import { DatabaseSignal, LocalStatus } from '../types/system.types';

export const POLL_INTERVAL_FOCUSED_MS = 10_000;
export const POLL_INTERVAL_BLURRED_MS = 30_000;

/**
 * One slow response is not an outage. The strip only claims the backend is
 * disconnected after two consecutive failed polls, which keeps a busy moment on
 * the business PC from flickering the chip red in front of a customer.
 */
export const DISCONNECT_FAILURE_THRESHOLD = 2;

export type WindowActivity = 'focused' | 'blurred' | 'hidden';

/** `false` stops polling entirely — the shape TanStack Query expects. */
export function resolvePollInterval(activity: WindowActivity): number | false {
  if (activity === 'hidden') return false;
  return activity === 'blurred' ? POLL_INTERVAL_BLURRED_MS : POLL_INTERVAL_FOCUSED_MS;
}

export function shouldShowDisconnected(consecutiveFailures: number): boolean {
  return consecutiveFailures >= DISCONNECT_FAILURE_THRESHOLD;
}

/**
 * The database signal is only meaningful while the backend is answering. Once
 * it is not, the last known value is stale and must not be shown as current.
 */
export function resolveDatabaseSignal(status: LocalStatus | undefined, backendConnected: boolean): DatabaseSignal {
  if (!backendConnected || !status) return 'UNKNOWN';
  return status.database;
}
