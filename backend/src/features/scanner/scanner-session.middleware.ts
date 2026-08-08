import { NextFunction, Request, Response } from 'express';
import { AuthenticationError } from '../../lib/errors';
import { ScannerService } from './scanner.service';
import { ScannerSession } from './scanner.store';

export const SCANNER_SESSION_HEADER = 'x-scanner-session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      scannerSession?: ScannerSession;
    }
  }
}

/**
 * Authenticates a paired phone, and nothing else.
 *
 * Deliberately separate from `requireAuth` and structurally incapable of
 * standing in for it:
 *   * it never populates `req.user`, so a route guarded by `requireRole` cannot
 *     be satisfied by a scanner session;
 *   * it never issues a JWT and never sets a cookie;
 *   * it reads its own header, so an `Authorization: Bearer` token is not even
 *     looked at here.
 *
 * A scanner session is therefore only ever usable on routes that explicitly ask
 * for one — which, until the LAN listener exists, is none of them.
 */
export const requireScannerSession = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers[SCANNER_SESSION_HEADER];
  const token = typeof header === 'string' ? header.trim() : '';

  if (!token) return next(new AuthenticationError('Scanner session required'));

  const session = ScannerService.touchSession(token);
  // One message for unknown, revoked, and expired alike.
  if (!session) return next(new AuthenticationError('Scanner session is not valid'));

  req.scannerSession = session;
  next();
};
