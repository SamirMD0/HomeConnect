import { describe, expect, it } from 'vitest';
import { ScannerSession } from '../types/scanner.types';
import {
  canManageScanner, defaultUrl, describeLanMode, describeSession,
  formatCountdown, formatLastSeen, PAIRING_CODE_EXPIRED, secondsRemaining,
} from './scanner-admin';

const NOW = Date.parse('2026-08-07T14:20:00.000Z');

const session = (overrides: Partial<ScannerSession> = {}): ScannerSession => ({
  id: 'session-1',
  deviceLabel: 'OppoA58',
  createdAt: '2026-08-07T14:16:26.128Z',
  expiresAt: '2026-08-08T02:17:27.828Z',
  lastSeenAt: '2026-08-07T14:19:30.000Z',
  revokedAt: null,
  isActive: true,
  ...overrides,
});

describe('canManageScanner', () => {
  it('admits only admins', () => {
    expect(canManageScanner('ADMIN')).toBe(true);
    expect(canManageScanner('EMPLOYEE')).toBe(false);
    expect(canManageScanner(undefined)).toBe(false);
  });
});

describe('describeLanMode', () => {
  it('treats only AVAILABLE as reachable by a phone', () => {
    expect(describeLanMode('AVAILABLE').reachable).toBe(true);
    for (const mode of ['DISABLED', 'STARTING', 'ERROR'] as const) {
      expect(describeLanMode(mode).reachable, mode).toBe(false);
    }
  });

  it('reads as off before any status has loaded', () => {
    expect(describeLanMode(undefined)).toMatchObject({ tone: 'muted', reachable: false });
  });

  it('marks a failed listener as a fault, not merely off', () => {
    expect(describeLanMode('ERROR').tone).toBe('bad');
    expect(describeLanMode('DISABLED').tone).toBe('muted');
  });

  it('labels every mode bilingually', () => {
    for (const mode of ['AVAILABLE', 'STARTING', 'ERROR', 'DISABLED'] as const) {
      expect(describeLanMode(mode).label, mode).toMatch(/[؀-ۿ]/);
    }
  });
});

describe('pairing countdown', () => {
  it('counts whole seconds down to the expiry', () => {
    expect(secondsRemaining('2026-08-07T14:25:00.000Z', NOW)).toBe(300);
    expect(secondsRemaining('2026-08-07T14:20:30.000Z', NOW)).toBe(30);
  });

  /**
   * A lapsed code is simply expired. Counting past zero would read as though it
   * were still usable.
   */
  it('floors at zero once the code has lapsed', () => {
    expect(secondsRemaining('2026-08-07T14:19:00.000Z', NOW)).toBe(0);
  });

  it('treats an unparseable expiry as expired rather than throwing', () => {
    expect(secondsRemaining('not-a-date', NOW)).toBe(0);
  });

  it('formats as minutes and padded seconds', () => {
    expect(formatCountdown(300)).toBe('5:00');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(9)).toBe('0:09');
  });

  it('reports expiry instead of a zero clock', () => {
    expect(formatCountdown(0)).toBe(PAIRING_CODE_EXPIRED);
    expect(formatCountdown(-10)).toBe(PAIRING_CODE_EXPIRED);
  });
});

describe('defaultUrl', () => {
  it('takes the first candidate, which the backend ranks most likely', () => {
    expect(defaultUrl(['http://192.168.0.178:3011/mobile-scanner', 'http://172.17.208.1:3011/mobile-scanner']))
      .toBe('http://192.168.0.178:3011/mobile-scanner');
  });

  it('has nothing to offer when the listener is down', () => {
    expect(defaultUrl([])).toBeNull();
  });
});

describe('describeSession', () => {
  it('marks a live session active', () => {
    expect(describeSession(session())).toMatchObject({ tone: 'good' });
  });

  it('distinguishes revoked from merely expired', () => {
    expect(describeSession(session({ revokedAt: '2026-08-07T14:19:00.000Z', isActive: false })).label).toContain('Revoked');
    expect(describeSession(session({ isActive: false })).label).toContain('Expired');
  });

  it('calls a session revoked even if the backend still flags it active', () => {
    expect(describeSession(session({ revokedAt: '2026-08-07T14:19:00.000Z' })).tone).toBe('muted');
  });
});

describe('formatLastSeen', () => {
  it('summarises recent activity compactly', () => {
    expect(formatLastSeen('2026-08-07T14:19:30.000Z', NOW)).toContain('just now');
    expect(formatLastSeen('2026-08-07T14:05:00.000Z', NOW)).toBe('15m ago');
    expect(formatLastSeen('2026-08-07T11:20:00.000Z', NOW)).toBe('3h ago');
    expect(formatLastSeen('2026-08-05T14:20:00.000Z', NOW)).toBe('2d ago');
  });

  it('does not invent a duration from a bad timestamp', () => {
    expect(formatLastSeen('nonsense', NOW)).toBe('—');
  });
});
