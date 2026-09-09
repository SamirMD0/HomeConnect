import type { NextFunction, Request, Response } from 'express';
import { BusinessSettingsService } from './business-settings.service';
import type { UpdateBusinessSettingsInput } from './business-settings.validator';

export class BusinessSettingsController {
  static async get(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await BusinessSettingsService.get() });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request<unknown, unknown, UpdateBusinessSettingsInput>, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await BusinessSettingsService.update(req.body, req.user!.userId) });
    } catch (error) {
      next(error);
    }
  }
}
