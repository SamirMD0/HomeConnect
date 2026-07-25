import { NextFunction, Request, Response } from 'express';
import { CustomerFinancialSummaryService } from './customer-financial-summary.service';
import {
  CustomerFinancialSummaryParamsInput,
  CustomerFinancialSummaryQueryInput,
} from './customer-financial-summary.validator';

export class CustomerFinancialSummaryController {
  static async getCustomerFinancialSummary(
    req: Request<CustomerFinancialSummaryParamsInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const summary = await CustomerFinancialSummaryService.getCustomerFinancialSummary(
        req.params.customerId,
        req.query as unknown as CustomerFinancialSummaryQueryInput
      );

      res.status(200).json({
        success: true,
        data: summary,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
}
