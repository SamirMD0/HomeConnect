import { Router } from 'express';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { rateLimit } from './scanner-rate-limit';
import { ScannerController } from './scanner.controller';
import { recentEventsQuerySchema, recordEventSchema, sessionParamsSchema } from './scanner.validator';

export const scannerRoutes = Router();

/**
 * Loopback routes only. Every one of these sits behind `requireAuth` where the
 * router is mounted; the phone-facing pairing route deliberately does not exist
 * here, because it cannot carry a user token and must not be reachable on the
 * main API. It arrives with the separate LAN listener.
 */

// Exposing a pairing code is what opens the door to a phone, so it is admin-only
// and rate limited even on loopback — a misbehaving renderer should not be able
// to mint codes in a loop.
scannerRoutes.post(
  '/pairing-code',
  requireRole(['ADMIN']),
  rateLimit({ name: 'scanner:pairing-code', limit: 10, windowMs: 60_000 }),
  ScannerController.createPairingCode
);

// Turning the LAN listener on or off is the most consequential action in the
// feature, so it is admin-only. Reading the status is not: the status strip
// shows it to everyone.
scannerRoutes.post('/lan/enable', requireRole(['ADMIN']), ScannerController.enableLan);
scannerRoutes.post('/lan/disable', requireRole(['ADMIN']), ScannerController.disableLan);
scannerRoutes.get('/lan-status', ScannerController.lanStatus);

scannerRoutes.get('/sessions', ScannerController.listSessions);

scannerRoutes.post(
  '/sessions/:sessionId/revoke',
  requireRole(['ADMIN']),
  validate(sessionParamsSchema, 'params'),
  ScannerController.revokeSession
);

scannerRoutes.get(
  '/events/recent',
  validate(recentEventsQuerySchema, 'query'),
  ScannerController.recentEvents
);

scannerRoutes.post(
  '/events',
  rateLimit({ name: 'scanner:events', limit: 60, windowMs: 60_000 }),
  validate(recordEventSchema),
  ScannerController.recordEvent
);
