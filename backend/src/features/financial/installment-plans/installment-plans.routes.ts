import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { requireFinancialAdmin } from '../authorization/financial-policy';
import { InstallmentPlansController } from './installment-plans.controller';
import {
  cancelInstallmentPlanSchema,
  createInstallmentPlanPaymentSchema,
  createInstallmentPlanSchema,
  customerInstallmentPlanParamsSchema,
  installmentPlanParamsSchema,
  listCustomerInstallmentPlansQuerySchema,
} from './installment-plans.validator';

export const customerInstallmentPlansRoutes = Router();
export const installmentPlansRoutes = Router();

customerInstallmentPlansRoutes.get(
  '/:customerId/installment-plans',
  validate(customerInstallmentPlanParamsSchema, 'params'),
  validate(listCustomerInstallmentPlansQuerySchema, 'query'),
  InstallmentPlansController.listCustomerPlans
);

customerInstallmentPlansRoutes.post(
  '/:customerId/installment-plans',
  validate(customerInstallmentPlanParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(createInstallmentPlanSchema),
  InstallmentPlansController.createPlan
);

installmentPlansRoutes.get(
  '/:planId',
  validate(installmentPlanParamsSchema, 'params'),
  InstallmentPlansController.getPlan
);

installmentPlansRoutes.get(
  '/:planId/payments',
  validate(installmentPlanParamsSchema, 'params'),
  InstallmentPlansController.listPlanPayments
);

installmentPlansRoutes.post(
  '/:planId/payments',
  validate(installmentPlanParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(createInstallmentPlanPaymentSchema),
  InstallmentPlansController.recordPlanPayment
);

installmentPlansRoutes.post(
  '/:planId/cancel',
  validate(installmentPlanParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(cancelInstallmentPlanSchema),
  InstallmentPlansController.cancelPlan
);
