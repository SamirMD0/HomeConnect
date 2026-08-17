import type { NextFunction, Request, Response } from 'express';
import { MonthlyReviewService } from './monthly-review.service';
import type { MonthlyReviewQueryInput } from './monthly-review.validator';

export class MonthlyReviewController {
  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const report = await MonthlyReviewService.get(req.query as unknown as MonthlyReviewQueryInput);
      res.status(200).json({ success: true, ...report });
    } catch (error) {
      next(error);
    }
  }

  static async exportCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await MonthlyReviewService.exportCsv(req.query as unknown as MonthlyReviewQueryInput);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.status(200).send(result.csv);
    } catch (error) { next(error); }
  }
}
