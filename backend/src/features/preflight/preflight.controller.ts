import { NextFunction, Request, Response } from 'express';
import { PreflightService } from './preflight.service';

const APP_VERSION = process.env.npm_package_version ?? process.env.APP_VERSION ?? 'unknown';

export class PreflightController {
  /**
   * Read-only, so it is safe to call at any time. Returns 200 even when checks
   * FAIL — the report *is* the answer, and a non-200 would make the UI show a
   * generic error instead of the diagnosis it just produced.
   */
  static async run(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await PreflightService.run(APP_VERSION) });
    } catch (error) {
      next(error);
    }
  }
}
