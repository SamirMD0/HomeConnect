import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { requireFinancialAdmin } from '../authorization/financial-policy';
import { DebtsController } from './debts.controller';
import {
  cancelDebtSchema,
  createDebtPaymentSchema,
  createDebtSchema,
  createPrepaidPurchaseSchema,
  customerDebtParamsSchema,
  debtParamsSchema,
  listCustomerDebtsQuerySchema,
  updateDebtSchema,
} from './debts.validator';

export const customerDebtsRoutes = Router();
export const debtsRoutes = Router();

customerDebtsRoutes.get(
  '/:customerId/debts',
  validate(customerDebtParamsSchema, 'params'),
  validate(listCustomerDebtsQuerySchema, 'query'),
  DebtsController.listCustomerDebts
);

customerDebtsRoutes.post(
  '/:customerId/debts',
  validate(customerDebtParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(createDebtSchema),
  DebtsController.createDebt
);

customerDebtsRoutes.post(
  '/:customerId/prepaid-purchases',
  validate(customerDebtParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(createPrepaidPurchaseSchema),
  DebtsController.createPrepaidPurchase
);

debtsRoutes.get(
  '/:debtId',
  validate(debtParamsSchema, 'params'),
  DebtsController.getDebt
);

debtsRoutes.get(
  '/:debtId/payments',
  validate(debtParamsSchema, 'params'),
  DebtsController.listDebtPayments
);

debtsRoutes.patch(
  '/:debtId',
  validate(debtParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(updateDebtSchema),
  DebtsController.updateDebt
);

debtsRoutes.post(
  '/:debtId/corrections',
  validate(debtParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(updateDebtSchema),
  DebtsController.correctDebt
);

debtsRoutes.post(
  '/:debtId/payments',
  validate(debtParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(createDebtPaymentSchema),
  DebtsController.recordDebtPayment
);

debtsRoutes.post(
  '/:debtId/cancel',
  validate(debtParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(cancelDebtSchema),
  DebtsController.cancelDebt
);
