import { NextFunction, Request, Response } from 'express';
import { InstallmentPlansService } from './installment-plans.service';
import {
  CancelInstallmentPlanInput,
  CreateInstallmentPlanInput,
  CreateInstallmentPlanPaymentInput,
  CustomerInstallmentPlanParamsInput,
  InstallmentPlanParamsInput,
  ListCustomerInstallmentPlansQueryInput,
} from './installment-plans.validator';

export class InstallmentPlansController {
  static async createPlan(
    req: Request<CustomerInstallmentPlanParamsInput, unknown, CreateInstallmentPlanInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const plan = await InstallmentPlansService.createPlan(
        req.params.customerId,
        req.body,
        req.user!
      );
      res.status(201).json({
        success: true,
        data: plan,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async listCustomerPlans(
    req: Request<CustomerInstallmentPlanParamsInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const result = await InstallmentPlansService.listCustomerPlans(
        req.params.customerId,
        req.query as unknown as ListCustomerInstallmentPlansQueryInput
      );
      res.status(200).json({
        success: true,
        data: result.plans,
        meta: {
          pagination: {
            page: result.page,
            pageSize: result.limit,
            totalItems: result.total,
            totalPages: Math.ceil(result.total / result.limit),
          },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPlan(
    req: Request<InstallmentPlanParamsInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const plan = await InstallmentPlansService.getPlan(req.params.planId);
      res.status(200).json({
        success: true,
        data: plan,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async listPlanPayments(
    req: Request<InstallmentPlanParamsInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const payments = await InstallmentPlansService.listPlanPayments(req.params.planId);
      res.status(200).json({
        success: true,
        data: payments,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async recordPlanPayment(
    req: Request<InstallmentPlanParamsInput, unknown, CreateInstallmentPlanPaymentInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const plan = await InstallmentPlansService.recordPlanPayment(
        req.params.planId,
        req.body,
        req.user!
      );
      res.status(201).json({
        success: true,
        data: plan,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async cancelPlan(
    req: Request<InstallmentPlanParamsInput, unknown, CancelInstallmentPlanInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const plan = await InstallmentPlansService.cancelPlan(req.params.planId, req.body, req.user!);
      res.status(200).json({
        success: true,
        data: plan,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
}
