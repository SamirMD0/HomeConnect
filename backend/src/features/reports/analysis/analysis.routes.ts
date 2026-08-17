import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { requireRole } from '../../../middleware/role.middleware';
import { validate } from '../../../middleware/validate.middleware';
import { monthlyReviewQuerySchema } from '../monthly-review/monthly-review.validator';
import type { MonthlyReviewQueryInput } from '../monthly-review/monthly-review.validator';
import { AnalysisService } from './analysis.service';

export const analysisRoutes = Router();

// Read-only and ADMIN-only: the analysis portal exposes the whole financial
// position of the business in one response.
analysisRoutes.get('/analysis/export.csv', requireRole(['ADMIN']), validate(monthlyReviewQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filename, csv } = await AnalysisService.exportCsv(req.query as unknown as MonthlyReviewQueryInput);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) { next(error); }
  });

analysisRoutes.get('/analysis', requireRole(['ADMIN']), validate(monthlyReviewQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AnalysisService.get(req.query as unknown as MonthlyReviewQueryInput);
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  });
