import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { requireSupplierAdmin } from '../authorization/supplier-policy';
import { SupplierPurchasesController } from './supplier-purchases.controller';
import { createSupplierPurchaseSchema, receiptCheckSchema, supplierPurchaseIdParamsSchema, supplierPurchaseListSchema, supplierPurchaseParamsSchema } from './supplier-purchases.validator';

/**
 * Creating a purchase writes both a supplier ledger entry and stock, so it takes
 * the stricter of the two guards: supplier-admin. Employees keep receiving stock
 * through the standalone inventory receiving route, which is unchanged.
 */
export const supplierPurchasesRoutes = Router();
supplierPurchasesRoutes.get('/:supplierId/purchases', validate(supplierPurchaseParamsSchema, 'params'), validate(supplierPurchaseListSchema, 'query'), SupplierPurchasesController.listForSupplier);
supplierPurchasesRoutes.post('/:supplierId/purchases', requireSupplierAdmin, validate(supplierPurchaseParamsSchema, 'params'), validate(createSupplierPurchaseSchema), SupplierPurchasesController.create);

export const supplierPurchasesGlobalRoutes = Router();
supplierPurchasesGlobalRoutes.get('/receipt-check', validate(receiptCheckSchema, 'query'), SupplierPurchasesController.receiptCheck);
supplierPurchasesGlobalRoutes.get('/:purchaseId', validate(supplierPurchaseIdParamsSchema, 'params'), SupplierPurchasesController.get);
