import type { NextFunction, Request, Response } from 'express';
import { ReportRowsService } from './report-rows.service';
import type { ReportSlice } from './report-rows.types';
import type { ReportRowsQueryInput } from './report-rows.validator';

export class ReportRowsController {
  static get(slice: ReportSlice) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const report = await ReportRowsService.get(slice, req.query as unknown as ReportRowsQueryInput);
        res.status(200).json({ success: true, ...report });
      } catch (error) { next(error); }
    };
  }

  static exportCsv(slice: ReportSlice) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await ReportRowsService.exportCsv(slice, req.query as unknown as ReportRowsQueryInput);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.status(200).send(result.csv);
      } catch (error) { next(error); }
    };
  }
}
