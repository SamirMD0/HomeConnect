import { NextFunction, Request, Response } from 'express';
import { PrepaidService, PrepaidRequestContext } from './prepaid.service';
import {
  DeliverPrepaidInput,
  PrepaidListQueryInput,
  PrepaidParamsInput,
  RevertPrepaidDeliveryInput,
} from './prepaid.validator';

const contextFrom = (req: Request): PrepaidRequestContext => ({
  requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null,
  ipAddress: req.ip ?? null,
});

export class PrepaidController {
  static async listPrepaidPurchases(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await PrepaidService.listPrepaidPurchases(
        req.query as unknown as PrepaidListQueryInput
      );
      res.json({
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPrepaidPurchase(
    req: Request<PrepaidParamsInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const prepaid = await PrepaidService.getPrepaidPurchase(req.params.id);
      res.json({
        success: true,
        data: prepaid,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async deliver(
    req: Request<PrepaidParamsInput, unknown, DeliverPrepaidInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const prepaid = await PrepaidService.deliver(
        req.params.id,
        req.body,
        req.user!,
        contextFrom(req)
      );
      res.json({
        success: true,
        data: prepaid,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async revertDelivery(
    req: Request<PrepaidParamsInput, unknown, RevertPrepaidDeliveryInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const prepaid = await PrepaidService.revertDelivery(
        req.params.id,
        req.body,
        req.user!,
        contextFrom(req)
      );
      res.json({
        success: true,
        data: prepaid,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
}
