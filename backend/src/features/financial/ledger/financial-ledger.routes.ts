import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { FinancialLedgerController } from './financial-ledger.controller';
import { financialLedgerQuerySchema } from './financial-ledger.validator';

export const financialLedgerRoutes = Router();

financialLedgerRoutes.get(
  '/',
  validate(financialLedgerQuerySchema, 'query'),
  FinancialLedgerController.getFinancialLedger
);
