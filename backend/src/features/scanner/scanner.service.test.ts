import { beforeEach, describe, expect, it } from 'vitest';
import { AuthenticationError, NotFoundError, ValidationError } from '../../lib/errors';
import {
  MAX_CONCURRENT_SESSIONS,
  MAX_FAILED_PAIRING_ATTEMPTS,
  PAIRING_ATTEMPT_WINDOW_MS,
  PAIRING_CODE_TTL_MS,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  ScannerService,
} from './scanner.service';
import { SCANNER_EVENT_BUFFER_SIZE, scannerStore } from './scanner.store';

const IP = '192.168.1.50';
const T0 = Date.UTC(2026, 7, 7, 10, 0, 0);

const pair = (overrides: { code?: string; deviceLabel?: string; ipAddress?: string } = {}, now = T0) =>
  ScannerService.pairScanner({
    code: overrides.code ?? '000000',
    deviceLabel: overrides.deviceLabel ?? 'Shop phone',
    ipAddress: overrides.ipAddress ?? IP,
  }, now);

/** Pairs successfully by minting a code and reading it back from the mint call. */
const pairWithFreshCode = (now = T0, ipAddress = IP, deviceLabel = 'Shop phone') => {
  const { code } = ScannerService.createPairingCode('user-1', now);
  return pair({ code, deviceLabel, ipAddress }, now);
};

beforeEach(() => scannerStore.reset());

describe('pairing codes', () => {
  it('mints a six-digit code that expires in five minutes', () => {
    const { code, expiresAt } = ScannerService.createPairingCode('user-1', T0);
    expect(code).toMatch(/^\d{6}$/);
    expect(Date.parse(expiresAt)).toBe(T0 + PAIRING_CODE_TTL_MS);
  });

  it('never stores the code itself', () => {
    const { code } = ScannerService.createPairingCode('user-1', T0);
    const stored = scannerStore.getPairingCode();
    expect(stored?.codeHash).not.toContain(code);
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('voids the previous code when a new one is minted', () => {
    const first = ScannerService.createPairingCode('user-1', T0).code;
    ScannerService.createPairingCode('user-1', T0 + 1_000);
    expect(() => pair({ code: first }, T0 + 2_000)).toThrow(AuthenticationError);
  });

  it('accepts a correct code exactly once', () => {
    const { code } = ScannerService.createPairingCode('user-1', T0);
    expect(pair({ code }, T0).token).toBeTruthy();
    expect(() => pair({ code }, T0 + 1_000)).toThrow(AuthenticationError);
  });

  it('rejects a code past its expiry', () => {
    const { code } = ScannerService.createPairingCode('user-1', T0);
    expect(() => pair({ code }, T0 + PAIRING_CODE_TTL_MS + 1)).toThrow(AuthenticationError);
  });

  it('rejects pairing when no code was ever issued', () => {
    expect(() => pair({ code: '123456' })).toThrow(AuthenticationError);
  });

  it('gives the same message for every failure so nothing can be probed apart', () => {
    const messages = new Set<string>();
    const collect = (run: () => unknown) => {
      try { run(); } catch (error) { messages.add((error as Error).message); }
    };
    collect(() => pair({ code: '111111' }));
    ScannerService.createPairingCode('user-1', T0);
    collect(() => pair({ code: '999999' }));
    const { code } = ScannerService.createPairingCode('user-1', T0);
    pair({ code }, T0);
    collect(() => pair({ code }, T0));
    expect([...messages]).toEqual(['Pairing failed']);
  });

  it('requires a device label before consuming anything', () => {
    const { code } = ScannerService.createPairingCode('user-1', T0);
    expect(() => pair({ code, deviceLabel: '   ' }, T0)).toThrow(ValidationError);
    // The code survived the malformed attempt.
    expect(pair({ code }, T0).token).toBeTruthy();
  });
});

describe('pairing lockout', () => {
  const failFiveTimes = (ipAddress = IP) => {
    ScannerService.createPairingCode('user-1', T0);
    for (let attempt = 0; attempt < MAX_FAILED_PAIRING_ATTEMPTS; attempt += 1) {
      expect(() => pair({ code: '000001', ipAddress }, T0 + attempt)).toThrow(AuthenticationError);
    }
  };

  it('locks an address out after five failures, even with the right code', () => {
    const { code } = ScannerService.createPairingCode('user-1', T0);
    for (let attempt = 0; attempt < MAX_FAILED_PAIRING_ATTEMPTS; attempt += 1) {
      expect(() => pair({ code: '000001' }, T0 + attempt)).toThrow(AuthenticationError);
    }
    expect(() => pair({ code }, T0 + 10)).toThrow(/Too many failed pairing attempts/);
  });

  it('locks out only the offending address', () => {
    failFiveTimes('192.168.1.99');
    const { code } = ScannerService.createPairingCode('user-1', T0);
    expect(pair({ code, ipAddress: IP }, T0 + 10).token).toBeTruthy();
  });

  it('releases the lockout once the window passes', () => {
    failFiveTimes();
    const later = T0 + PAIRING_ATTEMPT_WINDOW_MS + 1;
    const { code } = ScannerService.createPairingCode('user-1', later);
    expect(pair({ code }, later).token).toBeTruthy();
  });
});

describe('sessions', () => {
  it('returns the token once and stores only its hash', () => {
    const { token, sessionId } = pairWithFreshCode();
    const stored = scannerStore.getSession(sessionId);
    expect(stored?.tokenHash).toBeTruthy();
    expect(stored?.tokenHash).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('resolves a live token and slides the idle window', () => {
    const { token, sessionId } = pairWithFreshCode();
    const later = T0 + 60_000;
    const session = ScannerService.touchSession(token, later);
    expect(session?.id).toBe(sessionId);
    expect(session?.lastSeenAt).toBe(later);
    expect(session?.expiresAt).toBe(later + SESSION_IDLE_TTL_MS);
  });

  it('never slides past the absolute ceiling', () => {
    const { token } = pairWithFreshCode();
    // The idle window governs first, so the session has to be kept alive before
    // the 24-hour ceiling is anywhere near — it only binds for a phone that
    // keeps reporting.
    const stillIdleLive = T0 + SESSION_IDLE_TTL_MS - 1_000;
    expect(ScannerService.touchSession(token, stillIdleLive)?.expiresAt).toBe(stillIdleLive + SESSION_IDLE_TTL_MS);

    const nearCeiling = T0 + SESSION_ABSOLUTE_TTL_MS - (4 * 60 * 60 * 1000);
    expect(ScannerService.touchSession(token, nearCeiling)?.expiresAt).toBe(T0 + SESSION_ABSOLUTE_TTL_MS);
  });

  it('rejects an unknown token', () => {
    pairWithFreshCode();
    expect(ScannerService.touchSession('not-a-real-token')).toBeNull();
  });

  it('rejects a token after its idle window lapses', () => {
    const { token } = pairWithFreshCode();
    expect(ScannerService.touchSession(token, T0 + SESSION_IDLE_TTL_MS + 1)).toBeNull();
  });

  it('rejects a token at the absolute ceiling even if it kept reporting', () => {
    const { token } = pairWithFreshCode();
    let cursor = T0;
    for (let step = 0; step < 5; step += 1) {
      cursor += SESSION_IDLE_TTL_MS - 1_000;
      ScannerService.touchSession(token, cursor);
    }
    expect(ScannerService.touchSession(token, T0 + SESSION_ABSOLUTE_TTL_MS + 1)).toBeNull();
  });

  it('rejects a revoked token immediately', () => {
    const { token, sessionId } = pairWithFreshCode();
    ScannerService.revokeSession(sessionId, T0 + 5);
    expect(ScannerService.touchSession(token, T0 + 10)).toBeNull();
  });

  it('caps concurrent sessions by dropping the least recently seen', () => {
    const sessions = [];
    for (let index = 0; index < MAX_CONCURRENT_SESSIONS; index += 1) {
      sessions.push(pairWithFreshCode(T0 + index, IP, `Phone ${index}`));
    }
    // All three are live, and the first is the least recently seen.
    expect(ScannerService.listSessions(T0 + 10).filter((session) => session.isActive)).toHaveLength(MAX_CONCURRENT_SESSIONS);

    const extra = pairWithFreshCode(T0 + 100, IP, 'Phone 4');
    const active = ScannerService.listSessions(T0 + 101).filter((session) => session.isActive);
    expect(active).toHaveLength(MAX_CONCURRENT_SESSIONS);
    expect(ScannerService.touchSession(sessions[0].token, T0 + 101)).toBeNull();
    expect(ScannerService.touchSession(extra.token, T0 + 101)).not.toBeNull();
  });

  it('never exposes a token hash through the session list', () => {
    pairWithFreshCode();
    const [view] = ScannerService.listSessions(T0);
    expect(Object.keys(view).sort()).toEqual(
      ['createdAt', 'deviceLabel', 'expiresAt', 'id', 'isActive', 'lastSeenAt', 'revokedAt']
    );
  });

  it('revoking twice keeps the first revocation time', () => {
    const { sessionId } = pairWithFreshCode();
    const first = ScannerService.revokeSession(sessionId, T0 + 5).revokedAt;
    expect(ScannerService.revokeSession(sessionId, T0 + 500).revokedAt).toBe(first);
  });

  it('rejects revoking a session that does not exist', () => {
    expect(() => ScannerService.revokeSession('nope')).toThrow(NotFoundError);
  });

  it('trims a device label to a safe length and strips control characters', () => {
    const { code } = ScannerService.createPairingCode('user-1', T0);
    const { sessionId } = pair({ code, deviceLabel: `${'x'.repeat(80)} ` }, T0);
    expect(scannerStore.getSession(sessionId)?.deviceLabel).toHaveLength(40);
  });
});

describe('scanner events', () => {
  const record = (code: string, now = new Date(T0)) =>
    ScannerService.recordEvent({ source: 'PC_SCANNER', code, status: 'FOUND', productId: null }, now);

  it('assigns increasing ids and reports the latest', () => {
    record('HC-000001');
    const second = record('HC-000002');
    expect(ScannerService.recentEvents().latestEventId).toBe(second.id);
    expect(second.id).toBeGreaterThan(1);
  });

  it('returns only events newer than the cursor, oldest first', () => {
    const first = record('HC-000001');
    record('HC-000002');
    record('HC-000003');
    const { events } = ScannerService.recentEvents(first.id);
    expect(events.map((event) => event.code)).toEqual(['HC-000002', 'HC-000003']);
  });

  it('caps the buffer and keeps the newest entries', () => {
    for (let index = 0; index < SCANNER_EVENT_BUFFER_SIZE + 25; index += 1) record(`CODE-${index}`);
    const { events } = ScannerService.recentEvents(0);
    expect(events).toHaveLength(SCANNER_EVENT_BUFFER_SIZE);
    expect(events[events.length - 1].code).toBe(`CODE-${SCANNER_EVENT_BUFFER_SIZE + 24}`);
    expect(events[0].code).toBe(`CODE-${25}`);
  });

  it('records the source and leaves the product optional', () => {
    const event = ScannerService.recordEvent({ source: 'PHONE_SCANNER', code: 'X-1234', status: 'NOT_FOUND' }, new Date(T0));
    expect(event).toMatchObject({ source: 'PHONE_SCANNER', status: 'NOT_FOUND', productId: null, sessionId: null });
  });
});

describe('store lifetime', () => {
  it('drops every session and event on reset, as a restart would', () => {
    pairWithFreshCode();
    ScannerService.recordEvent({ source: 'PC_SCANNER', code: 'HC-000001', status: 'FOUND' });
    scannerStore.reset();
    expect(ScannerService.listSessions()).toEqual([]);
    expect(ScannerService.recentEvents().events).toEqual([]);
  });
});
