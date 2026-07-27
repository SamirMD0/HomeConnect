import { NextFunction, Request, Response } from 'express';
import { DebtsService } from './debts.service';
import {
  CancelDebtInput,
  CreateDebtInput,
  CreateDebtPaymentInput,
  CustomerDebtParamsInput,
  DebtParamsInput,
  ListCustomerDebtsQueryInput,
  UpdateDebtInput,
} from './debts.validator';

export class DebtsController {
  static async createDebt(
    req: Request<CustomerDebtParamsInput, unknown, CreateDebtInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const debt = await DebtsService.createDebt(req.params.customerId, req.body, req.user!);
      res.status(201).json({
        success: true,
        data: debt,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async listCustomerDebts(
    req: Request<CustomerDebtParamsInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const result = await DebtsService.listCustomerDebts(
        req.params.customerId,
        req.query as unknown as ListCustomerDebtsQueryInput
      );
      res.status(200).json({
        success: true,
        data: result.debts,
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

  static async getDebt(
    req: Request<DebtParamsInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const debt = await DebtsService.getDebt(req.params.debtId);
      res.status(200).json({
        success: true,
        data: debt,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async listDebtPayments(
    req: Request<DebtParamsInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const payments = await DebtsService.listDebtPayments(req.params.debtId);
      res.status(200).json({
        success: true,
        data: payments,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateDebt(
    req: Request<DebtParamsInput, unknown, UpdateDebtInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const debt = await DebtsService.updateDebt(req.params.debtId, req.body, req.user!);
      res.status(200).json({
        success: true,
        data: debt,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async correctDebt(
    req: Request<DebtParamsInput, unknown, UpdateDebtInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const debt = await DebtsService.correctDebt(req.params.debtId, req.body, req.user!);
      res.status(200).json({
        success: true,
        data: debt,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async recordDebtPayment(
    req: Request<DebtParamsInput, unknown, CreateDebtPaymentInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const debt = await DebtsService.recordDebtPayment(req.params.debtId, req.body, req.user!);
      res.status(201).json({
        success: true,
        data: debt,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }

  static async cancelDebt(
    req: Request<DebtParamsInput, unknown, CancelDebtInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const debt = await DebtsService.cancelDebt(req.params.debtId, req.body, req.user!);
      res.status(200).json({
        success: true,
        data: debt,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      next(error);
    }
  }
}
