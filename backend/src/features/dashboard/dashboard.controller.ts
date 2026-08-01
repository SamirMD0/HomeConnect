import type { NextFunction, Request, Response } from 'express';
import { DashboardAnalyticsService } from './dashboard.service';
import type { DashboardActivityQueryInput, DashboardMonthEndQueryInput, DashboardQueryInput } from './dashboard.validator';

export class DashboardAnalyticsController {
  static overview = handler((req, options) => DashboardAnalyticsService.overview(req.query as unknown as DashboardQueryInput, options));
  static customerFinancial = handler((req, options) => DashboardAnalyticsService.customerFinancial(req.query as unknown as DashboardQueryInput, options));
  static supplierFinancial = handler((req, options) => DashboardAnalyticsService.supplierFinancial(req.query as unknown as DashboardQueryInput, options));
  static serviceSummary = handler((req, options) => DashboardAnalyticsService.serviceSummary(req.query as unknown as DashboardQueryInput, options));
  static productSummary = handler((req, options) => DashboardAnalyticsService.productSummary(req.query as unknown as DashboardQueryInput, options));
  static alerts = handler((req, options) => DashboardAnalyticsService.alerts(req.query as unknown as DashboardQueryInput, options));
  static activity = handler((req, options) => DashboardAnalyticsService.activity((req.query as unknown as DashboardActivityQueryInput).limit, options));
  static monthEnd = handler((req, options) => DashboardAnalyticsService.monthEnd((req.query as unknown as DashboardMonthEndQueryInput).month, options));
}

function handler(load: (req: Request, options: { role: string; bypassCache: boolean }) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await load(req, {
        role: req.user?.role ?? 'EMPLOYEE',
        bypassCache: req.header('x-dashboard-refresh') === 'true',
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}

