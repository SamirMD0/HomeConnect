import type { NextFunction, Request, Response } from 'express';
import { ExchangeRatesService } from './exchange-rates.service';
import type { CreateExchangeRateInput } from './exchange-rates.validator';

export class ExchangeRatesController {
  static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await ExchangeRatesService.list() });
    } catch (error) {
      next(error);
    }
  }

  static async create(
    req: Request<unknown, unknown, CreateExchangeRateInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      res.status(201).json({
        success: true,
        data: await ExchangeRatesService.create(req.body, req.user!.userId),
      });
    } catch (error) {
      next(error);
    }
  }
}
