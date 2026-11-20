import type { OutboxRow } from './outbox';

/**
 * How often an open phone may contact the relay because of its outbox. Every
 * relay request wakes the Neon database (free plan: 100 compute-hours a
 * month), so waiting for the shop PC must not turn into polling.
 */
export const SEND_RETRY_MIN_MS = 30_000;
export const RESULT_CHECK_MS = 5 * 60_000;
export const MANUAL_REFRESH_MIN_MS = 30_000;
/**
 * Right after a send the shop PC is woken through the relay and usually
 * answers within seconds, and Neon is awake anyway: check every 15 s for the
 * first 2 minutes, every minute up to 10 minutes, then back to every 5.
 */
export const FRESH_RESULT_CHECK_MS = 15_000;
export const RECENT_RESULT_CHECK_MS = 60_000;
const FRESH_FOR_MS = 2 * 60_000;
const RECENT_FOR_MS = 10 * 60_000;

/** Not on the relay yet: the phone must send these. */
const NOT_SENT = new Set(['queued', 'awaiting_photo']);
/** On the relay, waiting for the shop PC: only the result needs checking. */
const WAITING_FOR_PC = new Set(['sent', 'pending', 'claimed']);

export interface WakeState {
  /** Last time this loop started a sync to send actions. */
  lastSendWakeAt: number;
  /** Last time results were checked (any completed sync checks them). */
  lastResultCheckAt: number;
}

export type WakeReason = 'send' | 'results' | null;

/**
 * Decide whether the foreground outbox loop should sync now.
 * - Actions not yet on the relay: send when their own backoff allows, but
 *   never more often than every 30 s.
 * - Actions already on the relay: check for the PC's result at most every
 *   5 minutes (the regular 15-minute sync and manual refresh also check).
 */
export function outboxWakeReason(rows: OutboxRow[], now: number, state: WakeState): WakeReason {
  const live = rows.filter((row) => !row.archived);
  const sendDue = live.some((row) => NOT_SENT.has(row.local_status) && row.next_attempt_at <= now);
  if (sendDue && now - state.lastSendWakeAt >= SEND_RETRY_MIN_MS) return 'send';
  const waiting = live.filter((row) => WAITING_FOR_PC.has(row.local_status));
  if (waiting.length && now - state.lastResultCheckAt >= resultCheckEvery(waiting, now)) return 'results';
  return null;
}

/** Newest wait first: an action sent seconds ago is checked far more often. */
function resultCheckEvery(waiting: OutboxRow[], now: number) {
  const newest = Math.max(...waiting.map((row) => Date.parse(row.updated_at ?? '') || 0));
  const age = now - newest;
  if (age < FRESH_FOR_MS) return FRESH_RESULT_CHECK_MS;
  if (age < RECENT_FOR_MS) return RECENT_RESULT_CHECK_MS;
  return RESULT_CHECK_MS;
}

/** Pull-to-refresh and opening the Waiting list: at most one sync per 30 s. */
export function manualRefreshAllowed(now: number, lastManualAt: number): boolean {
  return now - lastManualAt >= MANUAL_REFRESH_MIN_MS;
}
