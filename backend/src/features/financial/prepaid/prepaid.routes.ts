import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { requireFinancialAdmin } from '../authorization/financial-policy';
import { PrepaidController } from './prepaid.controller';
import {
  convertPrepaidSchema,
  deliverPrepaidSchema,
  prepaidListQuerySchema,
  prepaidParamsSchema,
  revertPrepaidDeliverySchema,
} from './prepaid.validator';

export const prepaidRoutes = Router();

prepaidRoutes.get(
  '/',
  validate(prepaidListQuerySchema, 'query'),
  PrepaidController.listPrepaidPurchases
);

prepaidRoutes.get(
  '/:id',
  validate(prepaidParamsSchema, 'params'),
  PrepaidController.getPrepaidPurchase
);

prepaidRoutes.post(
  '/:id/deliver',
  validate(prepaidParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(deliverPrepaidSchema),
  PrepaidController.deliver
);

prepaidRoutes.post(
  '/:id/convert',
  validate(prepaidParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(convertPrepaidSchema),
  PrepaidController.convert
);

prepaidRoutes.post(
  '/:id/revert-delivery',
  validate(prepaidParamsSchema, 'params'),
  requireFinancialAdmin,
  validate(revertPrepaidDeliverySchema),
  PrepaidController.revertDelivery
);
