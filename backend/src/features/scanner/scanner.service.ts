import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { AuthenticationError, NotFoundError, ValidationError } from '../../lib/errors';
import {
  PairingCode,
  ScanEventStatus,
  ScannerEvent,
  ScannerSession,
  ScanSource,
  scannerStore,
} from './scanner.store';

export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
export const PAIRING_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILED_PAIRING_ATTEMPTS = 5;
export const SESSION_IDLE_TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_CONCURRENT_SESSIONS = 3;
export const MAX_DEVICE_LABEL_LENGTH = 40;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Constant-time comparison of two hex digests.
 *
 * Both sides are hashed first so the buffers are always the same length, which
 * `timingSafeEqual` requires and which also stops the comparison from leaking
 * the length of the secret.
 */
function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** What a caller may see about a session. The token hash never appears. */
export interface ScannerSessionView {
  id: string;
  deviceLabel: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  isActive: boolean;
}

export class ScannerService {
  /**
   * Mints the code an employee types into the phone.
   *
   * Six digits is short enough to read off a screen and type on a phone, and
   * safe because it lives for five minutes, is single use, and survives only
   * five wrong guesses per IP. Only one code is outstanding at a time: minting a
   * new one silently voids the previous, so a code read aloud and forgotten
   * cannot be used later.
   */
  static createPairingCode(userId: string, now = Date.now()): { code: string; expiresAt: string } {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const record: PairingCode = {
      codeHash: sha256(code),
      createdAt: now,
      expiresAt: now + PAIRING_CODE_TTL_MS,
      usedAt: null,
      createdByUserId: userId,
    };
    scannerStore.setPairingCode(record);
    return { code, expiresAt: new Date(record.expiresAt).toISOString() };
  }

  /**
   * Exchanges a pairing code for a session token.
   *
   * Not reachable over HTTP yet — the phone has no user session, so this gets an
   * endpoint only on the separate LAN listener. It is exercised directly by
   * tests until then.
   *
   * Returns the raw token exactly once. Only its hash is stored, so a leak of
   * the store cannot be replayed as a session.
   */
  static pairScanner(
    input: { code: string; deviceLabel: string; ipAddress: string },
    now = Date.now()
  ): { sessionId: string; token: string; expiresAt: string } {
    pruneAttempts(now);

    // Validated first, so a malformed request never consumes the pairing code
    // or counts against the attempt budget.
    const deviceLabel = normalizeDeviceLabel(input.deviceLabel);

    if (isPairingLockedOut(input.ipAddress, now)) {
      throw new AuthenticationError('Too many failed pairing attempts. Try again later.');
    }

    const record = scannerStore.getPairingCode();
    const usable = Boolean(record) && record!.usedAt === null && record!.expiresAt > now;

    // One message for every failure mode: a caller must not be able to tell
    // "wrong code" from "expired" from "already used" from "none issued".
    if (!usable || !hashesMatch(sha256(input.code), record!.codeHash)) {
      scannerStore.recordPairingAttempt({ ipAddress: input.ipAddress, attemptedAt: now, succeeded: false });
      throw new AuthenticationError('Pairing failed');
    }

    scannerStore.setPairingCode({ ...record!, usedAt: now });
    scannerStore.recordPairingAttempt({ ipAddress: input.ipAddress, attemptedAt: now, succeeded: true });

    evictOldestWhenFull(now);

    const token = randomBytes(32).toString('base64url');
    const session: ScannerSession = {
      id: randomBytes(16).toString('hex'),
      deviceLabel,
      tokenHash: sha256(token),
      pairedByUserId: record!.createdByUserId,
      createdAt: now,
      expiresAt: now + SESSION_IDLE_TTL_MS,
      absoluteExpiresAt: now + SESSION_ABSOLUTE_TTL_MS,
      lastSeenAt: now,
      revokedAt: null,
    };
    scannerStore.putSession(session);

    return { sessionId: session.id, token, expiresAt: new Date(session.expiresAt).toISOString() };
  }

  /**
   * Resolves a bearer token to a live session and slides its idle window.
   *
   * Returns null rather than throwing so the middleware decides the response —
   * and so a caller can never distinguish "unknown token" from "revoked" from
   * "expired".
   */
  static touchSession(token: string, now = Date.now()): ScannerSession | null {
    const session = scannerStore.findSessionByTokenHash(sha256(token));
    if (!session || !isSessionLive(session, now)) return null;

    const next: ScannerSession = {
      ...session,
      lastSeenAt: now,
      // The idle window slides, but never past the absolute ceiling.
      expiresAt: Math.min(now + SESSION_IDLE_TTL_MS, session.absoluteExpiresAt),
    };
    scannerStore.putSession(next);
    return next;
  }

  static listSessions(now = Date.now()): ScannerSessionView[] {
    return scannerStore.listSessions().map((session) => toSessionView(session, now));
  }

  static revokeSession(id: string, now = Date.now()): ScannerSessionView {
    const session = scannerStore.getSession(id);
    if (!session) throw new NotFoundError('Scanner session not found');
    const revoked = { ...session, revokedAt: session.revokedAt ?? now };
    scannerStore.putSession(revoked);
    return toSessionView(revoked, now);
  }

  static recordEvent(input: {
    source: ScanSource;
    code: string;
    status: ScanEventStatus;
    productId?: string | null;
    sessionId?: string | null;
  }, now = new Date()): ScannerEvent {
    return scannerStore.appendEvent({
      sessionId: input.sessionId ?? null,
      source: input.source,
      code: input.code,
      status: input.status,
      productId: input.productId ?? null,
      createdAt: now.toISOString(),
    });
  }

  static recentEvents(since = 0): { events: ScannerEvent[]; latestEventId: number } {
    return { events: scannerStore.eventsSince(since), latestEventId: scannerStore.latestEventId() };
  }
}

function toSessionView(session: ScannerSession, now: number): ScannerSessionView {
  return {
    id: session.id,
    deviceLabel: session.deviceLabel,
    createdAt: new Date(session.createdAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    lastSeenAt: new Date(session.lastSeenAt).toISOString(),
    revokedAt: session.revokedAt === null ? null : new Date(session.revokedAt).toISOString(),
    isActive: isSessionLive(session, now),
  };
}

function isSessionLive(session: ScannerSession, now: number): boolean {
  return session.revokedAt === null && session.expiresAt > now && session.absoluteExpiresAt > now;
}

/**
 * Keeps the number of live phones bounded. The least recently seen is dropped,
 * because a phone that stopped reporting is the one most likely to have been put
 * down or left the shop.
 */
function evictOldestWhenFull(now: number): void {
  const live = scannerStore.listSessions().filter((session) => isSessionLive(session, now));
  if (live.length < MAX_CONCURRENT_SESSIONS) return;
  const stale = [...live].sort((a, b) => a.lastSeenAt - b.lastSeenAt).slice(0, live.length - MAX_CONCURRENT_SESSIONS + 1);
  for (const session of stale) {
    scannerStore.putSession({ ...session, revokedAt: now });
  }
}

function isPairingLockedOut(ipAddress: string, now: number): boolean {
  return scannerStore.pairingAttempts().filter(
    (attempt) => attempt.ipAddress === ipAddress
      && !attempt.succeeded
      && now - attempt.attemptedAt <= PAIRING_ATTEMPT_WINDOW_MS
  ).length >= MAX_FAILED_PAIRING_ATTEMPTS;
}

function pruneAttempts(now: number): void {
  scannerStore.prunePairingAttempts(now - PAIRING_ATTEMPT_WINDOW_MS);
}

function normalizeDeviceLabel(raw: string): string {
  // Stripping control characters is the intent: a device label is shown in the
  // session list and must not be able to carry terminal escapes.
  // eslint-disable-next-line no-control-regex
  const label = raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
  if (!label) throw new ValidationError('Device label is required');
  return label.slice(0, MAX_DEVICE_LABEL_LENGTH);
}
