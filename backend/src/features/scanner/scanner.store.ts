/**
 * In-memory state for the scanner feature: phone sessions, the pairing codes
 * that create them, and a short history of scans.
 *
 * Nothing here is persisted, by design.
 *   * A session is a short-lived credential. Restarting the backend should
 *     invalidate every paired phone, and holding the hashes only in memory makes
 *     that automatic rather than a cleanup job that could be forgotten.
 *   * The event ring buffer is an operator convenience, not an audit trail. If
 *     scan history is ever needed for audit, that is a deliberate schema change,
 *     not a side effect of this file.
 *
 * This also keeps the feature free of any Prisma migration, which matters on the
 * business PC where the schema was assembled by hand-run repair scripts.
 */

export const SCANNER_EVENT_BUFFER_SIZE = 200;

export type ScanSource = 'PC_SCANNER' | 'PHONE_SCANNER';
export type ScanEventStatus = 'FOUND' | 'NOT_FOUND' | 'INVALID_CODE';

export interface ScannerSession {
  id: string;
  deviceLabel: string;
  /** SHA-256 of the issued token. The token itself is never retained. */
  tokenHash: string;
  pairedByUserId: string;
  createdAt: number;
  expiresAt: number;
  /** Hard ceiling regardless of activity, so a busy phone cannot renew forever. */
  absoluteExpiresAt: number;
  lastSeenAt: number;
  revokedAt: number | null;
}

export interface PairingCode {
  codeHash: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
  createdByUserId: string;
}

export interface ScannerEvent {
  id: number;
  sessionId: string | null;
  source: ScanSource;
  code: string;
  status: ScanEventStatus;
  productId: string | null;
  createdAt: string;
}

export interface PairingAttempt {
  ipAddress: string;
  attemptedAt: number;
  succeeded: boolean;
}

interface ScannerState {
  sessions: Map<string, ScannerSession>;
  pairingCode: PairingCode | null;
  events: ScannerEvent[];
  nextEventId: number;
  pairingAttempts: PairingAttempt[];
}

const state: ScannerState = {
  sessions: new Map(),
  pairingCode: null,
  events: [],
  nextEventId: 1,
  pairingAttempts: [],
};

export const scannerStore = {
  // --- sessions ---
  putSession(session: ScannerSession): ScannerSession {
    state.sessions.set(session.id, session);
    return session;
  },
  getSession(id: string): ScannerSession | undefined {
    return state.sessions.get(id);
  },
  findSessionByTokenHash(tokenHash: string): ScannerSession | undefined {
    for (const session of state.sessions.values()) {
      if (session.tokenHash === tokenHash) return session;
    }
    return undefined;
  },
  listSessions(): ScannerSession[] {
    return [...state.sessions.values()].sort((a, b) => b.createdAt - a.createdAt);
  },

  // --- pairing ---
  /** Only one code is outstanding at a time; minting a new one voids the old. */
  setPairingCode(code: PairingCode | null): void {
    state.pairingCode = code;
  },
  getPairingCode(): PairingCode | null {
    return state.pairingCode;
  },
  recordPairingAttempt(attempt: PairingAttempt): void {
    state.pairingAttempts.push(attempt);
  },
  pairingAttempts(): PairingAttempt[] {
    return state.pairingAttempts;
  },
  prunePairingAttempts(cutoff: number): void {
    const firstRecent = state.pairingAttempts.findIndex((attempt) => attempt.attemptedAt > cutoff);
    if (firstRecent === -1) state.pairingAttempts.length = 0;
    else if (firstRecent > 0) state.pairingAttempts.splice(0, firstRecent);
  },

  // --- events ---
  appendEvent(event: Omit<ScannerEvent, 'id'>): ScannerEvent {
    const stored: ScannerEvent = { ...event, id: state.nextEventId };
    state.nextEventId += 1;
    state.events.push(stored);
    if (state.events.length > SCANNER_EVENT_BUFFER_SIZE) {
      state.events.splice(0, state.events.length - SCANNER_EVENT_BUFFER_SIZE);
    }
    return stored;
  },
  /** Events newer than `since`, oldest first, so a poller can replay in order. */
  eventsSince(since: number): ScannerEvent[] {
    return state.events.filter((event) => event.id > since);
  },
  latestEventId(): number {
    return state.nextEventId - 1;
  },

  /** Full reset. Used by tests, and by disabling LAN mode in later work. */
  reset(): void {
    state.sessions.clear();
    state.pairingCode = null;
    state.events.length = 0;
    state.nextEventId = 1;
    state.pairingAttempts.length = 0;
  },
};
