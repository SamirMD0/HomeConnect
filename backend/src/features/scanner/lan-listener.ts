import express, { Express } from 'express';
import helmet from 'helmet';
import http from 'http';
import { errorHandler } from '../../middleware/error.middleware';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { privateIpv4Candidates, mobileScannerUrls } from './lan-address';
import { scannerLanRoutes } from './scanner.lan.routes';
import { scannerStore } from './scanner.store';

export const SCANNER_LAN_PORT = Number(process.env.SCANNER_LAN_PORT || 3011);
export const SCANNER_LAN_HOST = process.env.SCANNER_LAN_HOST || '0.0.0.0';

/** A phone posts a code and a device label. Nothing here needs a large body. */
const MAX_LAN_BODY = '4kb';

/**
 * How long LAN mode may sit unused before it closes itself.
 *
 * Eight hours covers a shop day without leaving the port open overnight, which
 * is the realistic failure: someone enables it for a stock count and nobody
 * thinks about it again. Any scanner request resets the clock, so a working day
 * never trips it.
 */
export const SCANNER_LAN_IDLE_MS = Number(process.env.SCANNER_LAN_IDLE_MS || 8 * 60 * 60 * 1000);

/** Coarse on purpose: this is a safety net, not a precise deadline. */
const IDLE_SWEEP_MS = 5 * 60 * 1000;

/** Pure so the policy can be tested without waiting eight hours. */
export function shouldAutoDisable(lastActivityAt: number, now: number, idleMs = SCANNER_LAN_IDLE_MS): boolean {
  return now - lastActivityAt >= idleMs;
}

export type LanScannerMode = 'DISABLED' | 'STARTING' | 'AVAILABLE' | 'ERROR';

export interface LanListenerStatus {
  mode: LanScannerMode;
  host: string;
  port: number;
  addresses: string[];
  urls: string[];
  activeSessionCount: number;
  error: string | null;
  firewall: { command: string; note: string };
}

/**
 * The Windows firewall cannot be opened without elevation, and attempting it
 * from a packaged app trips antivirus. The operator gets the exact command
 * instead, plus the part everyone misses: a network profile set to Public
 * blocks the port no matter what rule exists.
 */
const FIREWALL_GUIDANCE = {
  command: `New-NetFirewallRule -DisplayName "HomeConnect Scanner" -Direction Inbound -LocalPort ${SCANNER_LAN_PORT} -Protocol TCP -Action Allow -Profile Private`,
  note: 'Run once in an elevated PowerShell. The PC network must be set to Private, not Public.',
};

/**
 * A second Express app, entirely separate from the main API.
 *
 * This is the core of the design. The main app stays bound to loopback and is
 * never exposed; the LAN gets its own app that mounts only the scanner surface.
 * A route that was never mounted cannot be reached, so customers, debts,
 * payments, product writes and the admin routes are unreachable from the shop
 * Wi-Fi by construction rather than by a guard that could be misordered.
 *
 * Exported so tests can drive it with supertest without binding a real port.
 */
export function buildLanApp(): Express {
  const app = express();

  // The page sets its own nonce-based policy per response, so helmet's default
  // CSP is disabled here rather than fighting it.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(lanRequestLogger);
  app.use(express.json({ limit: MAX_LAN_BODY }));
  app.use(scannerLanRoutes);
  app.use(translateBodyParserErrors);
  app.use(errorHandler);

  return app;
}

/**
 * Records that something reached the LAN listener, and leaves a trail.
 *
 * Deliberately narrow: method, path, status, address, duration. No bodies, no
 * headers, no query. The pairing code arrives in a POST body and the session
 * token in a header, so neither can be written here — which is the point, since
 * this log is the one artefact that would outlive the in-memory session store.
 *
 * It doubles as the activity signal for idle auto-disable: a listener nobody is
 * talking to is a listener that should close.
 */
function lanRequestLogger(req: express.Request, res: express.Response, next: express.NextFunction) {
  const startedAt = Date.now();
  markLanActivity(startedAt);
  res.on('finish', () => {
    logger.info(`[LAN] ${req.method} ${req.path} - ${res.statusCode} - ${Date.now() - startedAt}ms - ${req.ip ?? 'unknown'}`);
  });
  next();
}

/**
 * Turns body-parser rejections into proper client errors.
 *
 * Without this, an oversized or malformed body reaches the shared error handler
 * as an unrecognised `Error` and comes back as a 500 — telling a caller the
 * server broke when in fact its request was refused, and writing a stack trace
 * into the diagnostics log for what is a routine rejection. On a port exposed to
 * the shop Wi-Fi that is both misleading and a log-flooding lever.
 *
 * Deliberately local to the LAN app rather than a change to the shared handler,
 * which is out of scope here.
 */
function translateBodyParserErrors(
  error: Error & { type?: string; status?: number },
  _req: express.Request,
  _res: express.Response,
  next: express.NextFunction
) {
  if (error?.type === 'entity.too.large') {
    return next(new AppError('Request body is too large', 413, 'PAYLOAD_TOO_LARGE'));
  }
  if (error?.type === 'entity.parse.failed') {
    return next(new AppError('Request body is not valid JSON', 400, 'INVALID_JSON'));
  }
  return next(error);
}

let server: http.Server | null = null;
let mode: LanScannerMode = 'DISABLED';
let lastError: string | null = null;
let lastActivityAt = 0;
let idleSweep: NodeJS.Timeout | null = null;

/** Called on every LAN request; also seeded when the listener starts. */
export function markLanActivity(at: number = Date.now()): void {
  lastActivityAt = at;
}

export function lastLanActivityAt(): number {
  return lastActivityAt;
}

export function lanListenerStatus(): LanListenerStatus {
  const addresses = mode === 'AVAILABLE' ? privateIpv4Candidates() : [];
  return {
    mode,
    host: SCANNER_LAN_HOST,
    port: SCANNER_LAN_PORT,
    addresses,
    urls: mobileScannerUrls(addresses, SCANNER_LAN_PORT),
    activeSessionCount: scannerStore.listSessions().filter((session) => session.revokedAt === null && session.expiresAt > Date.now()).length,
    error: lastError,
    firewall: FIREWALL_GUIDANCE,
  };
}

export function isLanListenerRunning(): boolean {
  return server !== null;
}

/**
 * Starts the listener. Idempotent: enabling twice is a no-op rather than an
 * error, because the UI cannot be relied on to know the current state.
 *
 * A failure to bind — almost always the port already being in use — resolves
 * into an ERROR status rather than rejecting into the process. Losing the whole
 * backend because a barcode convenience could not open a socket would be a far
 * worse outcome than the feature being unavailable.
 */
export function startLanListener(): Promise<LanListenerStatus> {
  if (server) return Promise.resolve(lanListenerStatus());

  mode = 'STARTING';
  lastError = null;

  return new Promise((resolve) => {
    const instance = http.createServer(buildLanApp());

    const onError = (error: NodeJS.ErrnoException) => {
      instance.removeListener('listening', onListening);
      server = null;
      mode = 'ERROR';
      lastError = error.code === 'EADDRINUSE'
        ? `Port ${SCANNER_LAN_PORT} is already in use.`
        : error.message;
      logger.warn(`LAN scanner listener failed to start: ${lastError}`);
      resolve(lanListenerStatus());
    };

    const onListening = () => {
      instance.removeListener('error', onError);
      // Past startup, a socket error must not take the process down with it.
      instance.on('error', (error) => logger.warn(`LAN scanner listener error: ${error.message}`));
      server = instance;
      mode = 'AVAILABLE';
      markLanActivity();
      startIdleSweep();
      logger.info(`LAN scanner listening on ${SCANNER_LAN_HOST}:${SCANNER_LAN_PORT}`);
      resolve(lanListenerStatus());
    };

    instance.once('error', onError);
    instance.once('listening', onListening);
    instance.listen(SCANNER_LAN_PORT, SCANNER_LAN_HOST);
  });
}

/**
 * Stops the listener and drops every paired phone.
 *
 * Revoking on disable is deliberate: an admin turning LAN mode off means "no
 * phone should be able to scan", and leaving live tokens behind would make that
 * untrue the moment it was switched back on.
 */
/**
 * Closes LAN mode once nobody has used it for the idle window.
 *
 * Unref'd so a pending sweep can never be the reason the process stays alive,
 * and cleared on stop so a disabled listener leaves no timer behind.
 */
function startIdleSweep(): void {
  stopIdleSweep();
  idleSweep = setInterval(() => {
    if (!server) return;
    if (!shouldAutoDisable(lastActivityAt, Date.now())) return;
    logger.info('LAN scanner idle; closing automatically');
    void stopLanListener();
  }, IDLE_SWEEP_MS);
  idleSweep.unref?.();
}

function stopIdleSweep(): void {
  if (idleSweep) clearInterval(idleSweep);
  idleSweep = null;
}

export function stopLanListener(): Promise<LanListenerStatus> {
  const instance = server;
  server = null;
  mode = 'DISABLED';
  lastError = null;
  stopIdleSweep();

  for (const session of scannerStore.listSessions()) {
    if (session.revokedAt === null) scannerStore.putSession({ ...session, revokedAt: Date.now() });
  }
  scannerStore.setPairingCode(null);

  if (!instance) return Promise.resolve(lanListenerStatus());

  return new Promise((resolve) => {
    instance.close(() => {
      logger.info('LAN scanner listener stopped');
      resolve(lanListenerStatus());
    });
    // Nothing holds a long-lived connection here, but a phone mid-request should
    // not be able to keep the socket open indefinitely.
    instance.closeAllConnections?.();
  });
}

/** Test seam: forgets listener state without touching a socket. */
export function resetLanListenerStateForTests(): void {
  server = null;
  mode = 'DISABLED';
  lastError = null;
  lastActivityAt = 0;
  stopIdleSweep();
}
