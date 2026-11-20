import { describe, expect, it } from 'vitest';
import type { OutboxRow } from './outbox';
import {
  manualRefreshAllowed,
  outboxWakeReason,
  RESULT_CHECK_MS,
  SEND_RETRY_MIN_MS,
} from './outbox-wake';

const row = (local_status: OutboxRow['local_status'], extra: Partial<OutboxRow> = {}) =>
  ({ local_status, archived: 0, next_attempt_at: 0, ...extra }) as OutboxRow;
const T = 10_000_000;

describe('outbox wake rules (protect the Neon free plan)', () => {
  it('sends a queued action right away, then no more than every 30 seconds', () => {
    expect(outboxWakeReason([row('queued')], T, { lastSendWakeAt: 0, lastResultCheckAt: T })).toBe('send');
    expect(outboxWakeReason([row('queued')], T + 10_000, { lastSendWakeAt: T, lastResultCheckAt: T })).toBeNull();
    expect(
      outboxWakeReason([row('queued')], T + SEND_RETRY_MIN_MS, { lastSendWakeAt: T, lastResultCheckAt: T })
    ).toBe('send');
  });

  it('respects each action’s own backoff before sending', () => {
    const later = row('queued', { next_attempt_at: T + 60_000 });
    expect(outboxWakeReason([later], T, { lastSendWakeAt: 0, lastResultCheckAt: T })).toBeNull();
  });

  it('re-uploads a photo the relay is still waiting for like an unsent action', () => {
    expect(outboxWakeReason([row('awaiting_photo')], T, { lastSendWakeAt: 0, lastResultCheckAt: T })).toBe('send');
  });

  it('checks for the PC result at most every 5 minutes, never every 15 seconds', () => {
    for (const status of ['sent', 'pending', 'claimed'] as const) {
      // 15-second ticks for 10 minutes: checks only at 5 and 10 minutes (was 40).
      let checks = 0;
      const state = { lastSendWakeAt: 0, lastResultCheckAt: T };
      for (let now = T; now <= T + 10 * 60_000; now += 15_000) {
        if (outboxWakeReason([row(status)], now, state) === 'results') {
          checks += 1;
          state.lastResultCheckAt = now;
        }
      }
      expect(checks, status).toBe(2);
    }
    expect(RESULT_CHECK_MS).toBe(5 * 60_000);
  });

  it('checks every 15 s just after a send, every minute up to 10 min, then every 5 min', () => {
    const sentAt = (age: number) => row('pending', { updated_at: new Date(T - age).toISOString() });
    const due = (age: number, sinceCheck: number) =>
      outboxWakeReason([sentAt(age)], T, { lastSendWakeAt: 0, lastResultCheckAt: T - sinceCheck });
    expect(due(30_000, 15_000)).toBe('results');
    expect(due(30_000, 10_000)).toBeNull();
    expect(due(5 * 60_000, 15_000)).toBeNull();
    expect(due(5 * 60_000, 60_000)).toBe('results');
    expect(due(20 * 60_000, 60_000)).toBeNull();
    expect(due(20 * 60_000, RESULT_CHECK_MS)).toBe('results');
    // The newest waiting action sets the pace.
    expect(
      outboxWakeReason([sentAt(20 * 60_000), sentAt(10_000)], T, { lastSendWakeAt: 0, lastResultCheckAt: T - 15_000 })
    ).toBe('results');
  });

  it('does nothing for finished, archived or empty outboxes', () => {
    const state = { lastSendWakeAt: 0, lastResultCheckAt: 0 };
    expect(outboxWakeReason([], T, state)).toBeNull();
    expect(outboxWakeReason([row('applied'), row('refused'), row('failed')], T, state)).toBeNull();
    expect(outboxWakeReason([row('queued', { archived: 1 }), row('pending', { archived: 1 })], T, state)).toBeNull();
  });

  it('limits manual refreshes to one per 30 seconds', () => {
    expect(manualRefreshAllowed(T, 0)).toBe(true);
    expect(manualRefreshAllowed(T + 29_000, T)).toBe(false);
    expect(manualRefreshAllowed(T + 30_000, T)).toBe(true);
  });
});
