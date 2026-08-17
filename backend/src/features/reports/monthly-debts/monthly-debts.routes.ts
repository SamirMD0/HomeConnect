import { Router } from 'express';
import { requireRole } from '../../../middleware/role.middleware';
import { validate } from '../../../middleware/validate.middleware';
import { MonthlyDebtsController } from './monthly-debts.controller';
import {
  monthlyDebtCsvQuerySchema,
  monthlyDebtReportQuerySchema,
  monthlyFinancialActivityQuerySchema,
  monthlyFinancialActivityCsvQuerySchema,
} from './monthly-debts.validator';

export const monthlyDebtsRoutes = Router();

monthlyDebtsRoutes.get(
  '/monthly-debts',
  requireRole(['ADMIN']),
  validate(monthlyDebtReportQuerySchema, 'query'),
  MonthlyDebtsController.getMonthlyDebtReport
);

monthlyDebtsRoutes.get(
  '/monthly-debts/export.csv',
  requireRole(['ADMIN']),
  validate(monthlyDebtCsvQuerySchema, 'query'),
  MonthlyDebtsController.exportMonthlyDebtCsv
);

monthlyDebtsRoutes.get(
  '/monthly-financial-activity/export.csv',
  requireRole(['ADMIN']),
  validate(monthlyFinancialActivityCsvQuerySchema, 'query'),
  MonthlyDebtsController.exportMonthlyFinancialActivityCsv
);

monthlyDebtsRoutes.get(
  '/monthly-financial-activity',
  requireRole(['ADMIN']),
  validate(monthlyFinancialActivityQuerySchema, 'query'),
  MonthlyDebtsController.getMonthlyFinancialActivity
);
