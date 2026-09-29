import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { CustomerStatementController } from './customer-statement.controller';
import { customerStatementParamsSchema, customerStatementQuerySchema } from './customer-statement.validator';

export const customerStatementRoutes = Router();

customerStatementRoutes.get(
  '/:customerId/statement',
  validate(customerStatementParamsSchema, 'params'),
  validate(customerStatementQuerySchema, 'query'),
  CustomerStatementController.get
);
