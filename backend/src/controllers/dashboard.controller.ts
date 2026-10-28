import { Request, Response, NextFunction } from 'express';
import { DashboardService } from '../services/dashboard.service';

export class DashboardController {
  static async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await DashboardService.getSummary(req.branchScope!);
      res.status(200).json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  }

  static async getRecentActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const activity = await DashboardService.getRecentActivity(req.branchScope!, req.user!.role);
      res.status(200).json({ success: true, data: activity });
    } catch (error) {
      next(error);
    }
  }
}
