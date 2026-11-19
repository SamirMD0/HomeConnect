import type { OutboxRow } from './outbox';

/**
 * How often an open phone may contact the relay because of its outbox. Every
 * relay request wakes the Neon database (free plan: 100 compute-hours a
 * month), so waiting for the shop PC must not turn into polling.
 */
export const SEND_RETRY_MIN_MS = 30_000;
export const RESULT_CHECK_MS = 5 * 60_000;
export const MANUAL_REFRESH_MIN_MS = 30_000;

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
  const waiting = live.some((row) => WAITING_FOR_PC.has(row.local_status));
  if (waiting && now - state.lastResultCheckAt >= RESULT_CHECK_MS) return 'results';
  return null;
}

/** Pull-to-refresh and opening the Waiting list: at most one sync per 30 s. */
export function manualRefreshAllowed(now: number, lastManualAt: number): boolean {
  return now - lastManualAt >= MANUAL_REFRESH_MIN_MS;
}
