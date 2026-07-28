import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { ReceivablesController } from './receivables.controller';
import { receivablesQuerySchema } from './receivables.validator';

export const receivablesRoutes = Router();

receivablesRoutes.get(
  '/',
  validate(receivablesQuerySchema, 'query'),
  ReceivablesController.getReceivables
);
