import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { requireSupplierAdmin } from '../authorization/supplier-policy';
import { SupplierTransactionsController } from './supplier-transactions.controller';
import { createSupplierTransactionSchema, supplierLedgerQuerySchema, supplierTransactionActionSchema, supplierTransactionListQuerySchema, supplierTransactionParamsSchema, supplierTransactionSupplierParamsSchema, updateSupplierTransactionSchema } from './supplier-transactions.validator';

export const supplierTransactionsRoutes = Router();
supplierTransactionsRoutes.get('/:supplierId/transactions', validate(supplierTransactionSupplierParamsSchema, 'params'), validate(supplierTransactionListQuerySchema, 'query'), SupplierTransactionsController.listForSupplier);
supplierTransactionsRoutes.post('/:supplierId/transactions', requireSupplierAdmin, validate(supplierTransactionSupplierParamsSchema, 'params'), validate(createSupplierTransactionSchema), SupplierTransactionsController.create);

export const supplierTransactionsGlobalRoutes = Router();
supplierTransactionsGlobalRoutes.get('/', validate(supplierLedgerQuerySchema, 'query'), SupplierTransactionsController.list);
supplierTransactionsGlobalRoutes.get('/:transactionId', validate(supplierTransactionParamsSchema, 'params'), SupplierTransactionsController.get);
supplierTransactionsGlobalRoutes.patch('/:transactionId', requireSupplierAdmin, validate(supplierTransactionParamsSchema, 'params'), validate(updateSupplierTransactionSchema), SupplierTransactionsController.update);
supplierTransactionsGlobalRoutes.post('/:transactionId/remove', requireSupplierAdmin, validate(supplierTransactionParamsSchema, 'params'), validate(supplierTransactionActionSchema), SupplierTransactionsController.remove);
supplierTransactionsGlobalRoutes.post('/:transactionId/restore', requireSupplierAdmin, validate(supplierTransactionParamsSchema, 'params'), validate(supplierTransactionActionSchema), SupplierTransactionsController.restore);
