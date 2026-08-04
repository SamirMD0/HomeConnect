import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { MaintenanceService } from './maintenance.service';

export const applyRepairsSchema = z.object({
  accountPassword: z.string().min(1, 'Account password is required'),
  /** Typed confirmation, so a destructive-sounding action cannot be a stray click. */
  confirmation: z.literal('APPLY', { message: 'Type APPLY to confirm' }),
});

export class MaintenanceController {
  static async overview(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await MaintenanceService.overview() });
    } catch (error) {
      next(error);
    }
  }

  static async applyRepairs(req: Request, res: Response, next: NextFunction) {
    try {
      const outcomes = await MaintenanceService.applyPendingChanges({
        userId: req.user!.userId,
        accountPassword: (req.body as { accountPassword: string }).accountPassword,
        ipAddress: req.ip ?? null,
      });
      res.json({ success: true, data: { outcomes } });
    } catch (error) {
      next(error);
    }
  }
}
