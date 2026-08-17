import { NextFunction, Request, Response } from 'express';
import { MonthlyDebtsService } from './monthly-debts.service';
import {
  MonthlyDebtCsvQueryInput,
  MonthlyDebtReportQueryInput,
  MonthlyFinancialActivityQueryInput,
  MonthlyFinancialActivityCsvQueryInput,
} from './monthly-debts.validator';

export class MonthlyDebtsController {
  static async getMonthlyDebtReport(req: Request, res: Response, next: NextFunction) {
    try {
      const report = await MonthlyDebtsService.getMonthlyDebtReport(
        req.query as unknown as MonthlyDebtReportQueryInput
      );

      res.status(200).json({
        success: true,
        data: report,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async exportMonthlyDebtCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const { filename, csv } = await MonthlyDebtsService.getMonthlyDebtCsv(
        req.query as unknown as MonthlyDebtCsvQueryInput
      );

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }

  static async getMonthlyFinancialActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const report = await MonthlyDebtsService.getMonthlyFinancialActivity(
        req.query as unknown as MonthlyFinancialActivityQueryInput
      );

      res.status(200).json({
        success: true,
        data: report,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async exportMonthlyFinancialActivityCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await MonthlyDebtsService.getMonthlyFinancialActivityCsv(
        req.query as unknown as MonthlyFinancialActivityCsvQueryInput
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.status(200).send(result.csv);
    } catch (error) { next(error); }
  }
}
