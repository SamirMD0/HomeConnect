import { randomBytes } from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { ProductsService } from '../service/products/products.service';
import { renderMobileScannerPage } from './mobile-scanner.page';
import { rateLimit } from './scanner-rate-limit';
import { requireScannerSession } from './scanner-session.middleware';
import { ScannerService } from './scanner.service';
import { lanEventSchema, LanEventInput, lanPairSchema, LanPairInput } from './scanner.validator';

const DEFAULT_DEVICE_LABEL = 'Phone scanner';

/**
 * Everything a device on the shop Wi-Fi can reach.
 *
 * This router is mounted only on the LAN listener, never on the main app. The
 * security model is that the surface is small by construction rather than
 * guarded by middleware ordering: there is no customer route here to forget to
 * protect, because none is mounted.
 *
 * Four endpoints, and only one of them can be reached without a session.
 */
export const scannerLanRoutes = Router();

scannerLanRoutes.get('/mobile-scanner', (_req: Request, res: Response) => {
  // A fresh nonce per response, so the page's inline style and script can run
  // without ever allowing 'unsafe-inline'.
  const nonce = randomBytes(16).toString('base64url');
  res.setHeader('Content-Security-Policy', [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'self'",
    "img-src 'self' data:",
    // A camera stream is attached via srcObject rather than fetched, but blob:
    // keeps the policy honest about what the video element may hold.
    "media-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.send(renderMobileScannerPage(nonce));
});

scannerLanRoutes.post(
  '/api/v1/scanner/pair',
  rateLimit({ name: 'scanner-lan:pair', limit: 10, windowMs: 60_000 }),
  validate(lanPairSchema),
  (req: Request<unknown, unknown, LanPairInput>, res: Response, next: NextFunction) => {
    try {
      const paired = ScannerService.pairScanner({
        code: req.body.code,
        deviceLabel: req.body.deviceLabel?.trim() || DEFAULT_DEVICE_LABEL,
        ipAddress: req.ip ?? 'unknown',
      });
      // The session id is intentionally absent: the phone has no use for it, and
      // it is the handle an admin uses to revoke.
      res.status(201).json({
        success: true,
        data: { token: paired.token, expiresAt: paired.expiresAt, deviceLabel: req.body.deviceLabel?.trim() || DEFAULT_DEVICE_LABEL },
      });
    } catch (error) { next(error); }
  }
);

scannerLanRoutes.post(
  '/api/v1/scanner/events',
  requireScannerSession,
  rateLimit({ name: 'scanner-lan:events', limit: 60, windowMs: 60_000 }),
  validate(lanEventSchema),
  async (req: Request<unknown, unknown, LanEventInput>, res: Response, next: NextFunction) => {
    try {
      // The server does the lookup. The phone reports a code and learns the
      // outcome; it never asserts what it matched.
      const result = await ProductsService.scanLookup({ code: req.body.code });

      ScannerService.recordEvent({
        source: 'PHONE_SCANNER',
        code: result.normalizedCode ?? req.body.code,
        status: result.status,
        productId: result.product?.id ?? null,
        sessionId: req.scannerSession?.id ?? null,
      });

      // `result.product` is built by serializeScanResult, so no price, cost,
      // stock, or internal code can reach the phone.
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }
);

scannerLanRoutes.get(
  '/api/v1/scanner/session',
  requireScannerSession,
  (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        deviceLabel: req.scannerSession!.deviceLabel,
        expiresAt: new Date(req.scannerSession!.expiresAt).toISOString(),
      },
    });
  }
);
