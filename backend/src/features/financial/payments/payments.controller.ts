import { NextFunction, Request, Response } from 'express';
import {
  CorrectPaymentInput,
  PaymentParamsInput,
  ReallocatePaymentInput,
  VoidPaymentInput,
} from './payments.validator';
import { PaymentsService } from './payments.service';

export class PaymentsController {
  static async voidPayment(
    req: Request<PaymentParamsInput, unknown, VoidPaymentInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const result = await PaymentsService.voidPayment(req.params.paymentId, req.body, req.user!);
      res.status(200).json({
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async correctPayment(
    req: Request<PaymentParamsInput, unknown, CorrectPaymentInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const result = await PaymentsService.correctPayment(req.params.paymentId, req.body, req.user!);
      res.status(200).json({
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async reallocatePayment(
    req: Request<PaymentParamsInput, unknown, ReallocatePaymentInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const result = await PaymentsService.reallocatePayment(req.params.paymentId, req.body, req.user!);
      res.status(200).json({
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
}
