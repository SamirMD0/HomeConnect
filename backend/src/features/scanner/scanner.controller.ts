import { NextFunction, Request, Response } from 'express';
import { lanListenerStatus, startLanListener, stopLanListener } from './lan-listener';
import { ScannerService } from './scanner.service';
import { RecentEventsQueryInput, RecordEventInput, SessionParamsInput } from './scanner.validator';

export class ScannerController {
  /**
   * Opens the shop Wi-Fi door. Admin-only, and never persisted: LAN mode is off
   * again after any restart, so an evening left enabled cannot become a
   * permanently open port.
   */
  static async enableLan(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await startLanListener() }); }
    catch (error) { next(error); }
  }

  static async disableLan(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await stopLanListener() }); }
    catch (error) { next(error); }
  }

  static lanStatus(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: lanListenerStatus() }); }
    catch (error) { next(error); }
  }

  /**
   * The one response in the feature that contains a secret. It is returned to an
   * authenticated admin on loopback, shown on screen, and never stored — only
   * the hash of the code is kept.
   */
  static createPairingCode(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: ScannerService.createPairingCode(req.user!.userId) }); }
    catch (error) { next(error); }
  }

  static listSessions(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: ScannerService.listSessions() }); }
    catch (error) { next(error); }
  }

  static revokeSession(req: Request<SessionParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: ScannerService.revokeSession(req.params.sessionId) }); }
    catch (error) { next(error); }
  }

  static recentEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const { since } = req.query as unknown as RecentEventsQueryInput;
      res.json({ success: true, data: ScannerService.recentEvents(since) });
    } catch (error) { next(error); }
  }

  static recordEvent(req: Request<unknown, unknown, RecordEventInput>, res: Response, next: NextFunction) {
    try {
      const event = ScannerService.recordEvent({
        source: 'PC_SCANNER',
        code: req.body.code,
        status: req.body.status,
        productId: req.body.productId ?? null,
      });
      res.status(201).json({ success: true, data: event });
    } catch (error) { next(error); }
  }
}
