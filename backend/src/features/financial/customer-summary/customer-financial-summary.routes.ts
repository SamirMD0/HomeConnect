import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { CustomerFinancialSummaryController } from './customer-financial-summary.controller';
import {
  customerFinancialSummaryParamsSchema,
  customerFinancialSummaryQuerySchema,
} from './customer-financial-summary.validator';

export const customerFinancialSummaryRoutes = Router();

customerFinancialSummaryRoutes.get(
  '/:customerId/activity',
  validate(customerFinancialSummaryParamsSchema, 'params'),
  CustomerFinancialSummaryController.getCustomerActivity
);

customerFinancialSummaryRoutes.get(
  '/:customerId/financial-summary',
  validate(customerFinancialSummaryParamsSchema, 'params'),
  validate(customerFinancialSummaryQuerySchema, 'query'),
  CustomerFinancialSummaryController.getCustomerFinancialSummary
);
