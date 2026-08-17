import { Router } from 'express';
import { requireRole } from '../../../middleware/role.middleware';
import { validate } from '../../../middleware/validate.middleware';
import { MonthlyReviewController } from './monthly-review.controller';
import { monthlyReviewQuerySchema } from './monthly-review.validator';

export const monthlyReviewRoutes = Router();

monthlyReviewRoutes.get(
  '/monthly-review/export.csv',
  requireRole(['ADMIN']),
  validate(monthlyReviewQuerySchema, 'query'),
  MonthlyReviewController.exportCsv
);

monthlyReviewRoutes.get(
  '/monthly-review',
  requireRole(['ADMIN']),
  validate(monthlyReviewQuerySchema, 'query'),
  MonthlyReviewController.get
);
