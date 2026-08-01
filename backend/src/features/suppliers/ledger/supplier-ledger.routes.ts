import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { SupplierTransactionsController } from '../transactions/supplier-transactions.controller';
import { supplierLedgerQuerySchema } from '../transactions/supplier-transactions.validator';

export const supplierLedgerRoutes = Router();
supplierLedgerRoutes.get('/', validate(supplierLedgerQuerySchema, 'query'), SupplierTransactionsController.ledger);
