import { describe, expect, it } from 'vitest';
import { ScannerEventRecord } from '../types/scanner.types';
import { nextCursor, pickAutoOpenEvent, selectNewPhoneEvents, toRecentScanFromEvent } from './scan-events';

const event = (overrides: Partial<ScannerEventRecord> & { id: number }): ScannerEventRecord => ({
  sessionId: 'session-1',
  source: 'PHONE_SCANNER',
  code: 'HC-000001',
  status: 'FOUND',
  productId: 'product-1',
  createdAt: '2026-08-07T14:17:28.187Z',
  ...overrides,
});

describe('selectNewPhoneEvents', () => {
  it('returns only events past the cursor', () => {
    const events = [event({ id: 1 }), event({ id: 2 }), event({ id: 3 })];
    expect(selectNewPhoneEvents(events, 1).map((e) => e.id)).toEqual([2, 3]);
  });

  /**
   * A desk scan was already handled by the scan box. Replaying it from the
   * server would open the same drawer a second time.
   */
  it('ignores scans made at the desk', () => {
    const events = [event({ id: 2, source: 'PC_SCANNER' }), event({ id: 3 })];
    expect(selectNewPhoneEvents(events, 1).map((e) => e.id)).toEqual([3]);
  });

  it('returns them oldest first, whatever order they arrived in', () => {
    const events = [event({ id: 5 }), event({ id: 3 }), event({ id: 4 })];
    expect(selectNewPhoneEvents(events, 2).map((e) => e.id)).toEqual([3, 4, 5]);
  });

  it('returns nothing when the cursor is current', () => {
    expect(selectNewPhoneEvents([event({ id: 1 })], 1)).toEqual([]);
  });
});

describe('nextCursor', () => {
  /**
   * The cursor tracks the newest id the server reported, not the newest phone
   * event — otherwise a run of desk scans would be re-fetched on every poll.
   */
  it('advances past desk scans the PC ignored', () => {
    expect(nextCursor(1, 9)).toBe(9);
  });

  it('never moves backwards if a response arrives out of order', () => {
    expect(nextCursor(9, 4)).toBe(9);
  });
});

describe('pickAutoOpenEvent', () => {
  it('opens the most recent match when several arrive at once', () => {
    const chosen = pickAutoOpenEvent([event({ id: 1, productId: 'a' }), event({ id: 2, productId: 'b' })]);
    expect(chosen?.productId).toBe('b');
  });

  it('opens nothing for a code that matched nothing', () => {
    expect(pickAutoOpenEvent([event({ id: 1, status: 'NOT_FOUND', productId: null })])).toBeNull();
  });

  it('opens nothing for an unreadable code', () => {
    expect(pickAutoOpenEvent([event({ id: 1, status: 'INVALID_CODE', productId: null })])).toBeNull();
  });

  it('skips a found event with no product id rather than opening nothing', () => {
    const chosen = pickAutoOpenEvent([event({ id: 1, productId: 'a' }), event({ id: 2, productId: null })]);
    expect(chosen?.productId).toBe('a');
  });

  it('opens nothing when no events arrived', () => {
    expect(pickAutoOpenEvent([])).toBeNull();
  });
});

describe('toRecentScanFromEvent', () => {
  it('carries the phone scan into the shared list', () => {
    expect(toRecentScanFromEvent(event({ id: 7 }))).toEqual({
      id: 'event-7',
      code: 'HC-000001',
      status: 'FOUND',
      source: 'PHONE_SCANNER',
      productId: 'product-1',
      productName: null,
      scannedAt: '2026-08-07T14:17:28.187Z',
    });
  });

  it('gives each event a stable id, so a repeated poll cannot duplicate it', () => {
    expect(toRecentScanFromEvent(event({ id: 7 })).id).toBe(toRecentScanFromEvent(event({ id: 7 })).id);
  });
});
