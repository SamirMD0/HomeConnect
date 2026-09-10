import { NextFunction, Request, Response } from 'express';
import { CustomerStatementService } from './customer-statement.service';
import type { CustomerStatementQuery } from './customer-statement.validator';

export class CustomerStatementController {
  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const statement = await CustomerStatementService.get(
        req.params.customerId as string,
        req.query as unknown as CustomerStatementQuery
      );
      res.status(200).json({
        success: true,
        data: statement,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
}
