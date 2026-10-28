import { NextFunction, Request, Response } from 'express';
import { DashboardFinancialService } from './dashboard-financial.service';

export class DashboardFinancialController {
  static async getFinancialSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await DashboardFinancialService.getFinancialSummary(req.branchScope!);

      res.status(200).json({
        success: true,
        data: summary,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
}
