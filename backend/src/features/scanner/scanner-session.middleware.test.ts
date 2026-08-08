import { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationError } from '../../lib/errors';
import { requireScannerSession, SCANNER_SESSION_HEADER } from './scanner-session.middleware';
import { ScannerService } from './scanner.service';
import { scannerStore } from './scanner.store';

const T0 = Date.UTC(2026, 7, 7, 10, 0, 0);

const runMiddleware = (headers: Record<string, string | undefined>) => {
  const req = { headers } as unknown as Request;
  const next = vi.fn() as unknown as NextFunction;
  requireScannerSession(req, {} as Response, next);
  return { req, next: next as unknown as ReturnType<typeof vi.fn> };
};

const issueToken = () => {
  const { code } = ScannerService.createPairingCode('user-1', Date.now());
  return ScannerService.pairScanner({ code, deviceLabel: 'Shop phone', ipAddress: '192.168.1.50' }, Date.now());
};

beforeEach(() => scannerStore.reset());

describe('requireScannerSession', () => {
  it('accepts a live session token and attaches the session', () => {
    const { token, sessionId } = issueToken();
    const { req, next } = runMiddleware({ [SCANNER_SESSION_HEADER]: token });
    expect(next).toHaveBeenCalledWith();
    expect(req.scannerSession?.id).toBe(sessionId);
  });

  it('rejects a missing header', () => {
    const { next } = runMiddleware({});
    expect(next.mock.calls[0][0]).toBeInstanceOf(AuthenticationError);
  });

  it('rejects an unknown, revoked, or expired token with one message', () => {
    const { token, sessionId } = issueToken();
    ScannerService.revokeSession(sessionId);

    const messages = new Set<string>();
    for (const candidate of ['totally-made-up', token]) {
      const { next } = runMiddleware({ [SCANNER_SESSION_HEADER]: candidate });
      messages.add((next.mock.calls[0][0] as Error).message);
    }
    expect([...messages]).toEqual(['Scanner session is not valid']);
  });

  /**
   * The structural guarantee behind the whole design: a paired phone must never
   * be able to satisfy a route that expects a signed-in user.
   */
  it('never populates req.user, so it cannot stand in for requireAuth', () => {
    const { token } = issueToken();
    const { req, next } = runMiddleware({ [SCANNER_SESSION_HEADER]: token });
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it('ignores an Authorization header entirely', () => {
    const { next } = runMiddleware({ authorization: 'Bearer something-that-looks-real' });
    expect(next.mock.calls[0][0]).toBeInstanceOf(AuthenticationError);
  });

  it('slides the session window on each accepted request', () => {
    // Both the issuing and the request must run on the same clock, or the
    // session is created in one era and touched in another.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(T0));
    const { token, sessionId } = issueToken();
    expect(scannerStore.getSession(sessionId)!.lastSeenAt).toBe(T0);

    vi.setSystemTime(new Date(T0 + 120_000));
    runMiddleware({ [SCANNER_SESSION_HEADER]: token });
    expect(scannerStore.getSession(sessionId)!.lastSeenAt).toBe(T0 + 120_000);
    vi.useRealTimers();
  });
});
