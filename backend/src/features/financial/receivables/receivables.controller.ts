import { NextFunction, Request, Response } from 'express';
import { ReceivablesService } from './receivables.service';
import { ReceivablesQueryInput } from './receivables.validator';

export class ReceivablesController {
  static async getReceivables(req: Request, res: Response, next: NextFunction) {
    try {
      const receivables = await ReceivablesService.getReceivables(
        req.query as unknown as ReceivablesQueryInput
      );

      res.status(200).json({
        success: true,
        data: receivables,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
}
