import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { requireFinancialAdmin } from '../authorization/financial-policy';
import { CorrectionsController } from './corrections.controller';
import {
  correctionsQuerySchema,
  customerCorrectionsParamsSchema,
} from './corrections.validator';

export const correctionsRoutes = Router();
export const customerCorrectionsRoutes = Router();

correctionsRoutes.get(
  '/',
  requireFinancialAdmin,
  validate(correctionsQuerySchema, 'query'),
  CorrectionsController.listCorrections
);

customerCorrectionsRoutes.get(
  '/:customerId/corrections',
  requireFinancialAdmin,
  validate(customerCorrectionsParamsSchema, 'params'),
  validate(correctionsQuerySchema.omit({ customerId: true }), 'query'),
  CorrectionsController.listCustomerCorrections
);
