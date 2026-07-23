import { Request, Response, NextFunction } from 'express';
import { DashboardService } from '../services/dashboard.service';

export class DashboardController {
  static async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await DashboardService.getSummary();
      res.status(200).json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  }

  static async getRecentActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const activity = await DashboardService.getRecentActivity();
      res.status(200).json({ success: true, data: activity });
    } catch (error) {
      next(error);
    }
  }
}
