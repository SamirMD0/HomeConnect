import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { requireFinancialAdmin } from '../authorization/financial-policy';
import { PaymentsController } from './payments.controller';
import {
  correctPaymentSchema,
  paymentParamsSchema,
  reallocatePaymentSchema,
  voidPaymentSchema,
} from './payments.validator';

export const paymentsRoutes = Router();

paymentsRoutes.post(
  '/:paymentId/void',
  validate(paymentParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(voidPaymentSchema),
  PaymentsController.voidPayment
);

paymentsRoutes.post(
  '/:paymentId/corrections',
  validate(paymentParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(correctPaymentSchema),
  PaymentsController.correctPayment
);

paymentsRoutes.post(
  '/:paymentId/reallocate',
  validate(paymentParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(reallocatePaymentSchema),
  PaymentsController.reallocatePayment
);
