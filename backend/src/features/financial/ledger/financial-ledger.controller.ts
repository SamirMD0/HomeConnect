import { NextFunction, Request, Response } from 'express';
import { FinancialLedgerService } from './financial-ledger.service';
import { FinancialLedgerQueryInput } from './financial-ledger.validator';

export class FinancialLedgerController {
  static async getFinancialLedger(req: Request, res: Response, next: NextFunction) {
    try {
      const ledger = await FinancialLedgerService.getFinancialLedger(
        req.query as unknown as FinancialLedgerQueryInput
      );

      res.status(200).json({
        success: true,
        data: ledger,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
}
