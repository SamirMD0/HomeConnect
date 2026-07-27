import { NextFunction, Request, Response } from 'express';
import {
  CorrectionsQueryInput,
  CustomerCorrectionsParamsInput,
} from './corrections.validator';
import { CorrectionsService } from './corrections.service';

export class CorrectionsController {
  static async listCorrections(
    req: Request<unknown, unknown, unknown, CorrectionsQueryInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const corrections = await CorrectionsService.listCorrections(req.query);
      res.status(200).json({
        success: true,
        data: corrections,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async listCustomerCorrections(
    req: Request<CustomerCorrectionsParamsInput, unknown, unknown, Omit<CorrectionsQueryInput, 'customerId'>>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const corrections = await CorrectionsService.listCorrections({
        ...req.query,
        customerId: req.params.customerId,
      });
      res.status(200).json({
        success: true,
        data: corrections,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
}
