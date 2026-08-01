import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { requireSupplierAdmin } from '../authorization/supplier-policy';
import { SuppliersController } from './suppliers.controller';
import { createSupplierSchema, supplierActionSchema, supplierAuditQuerySchema, supplierListQuerySchema, supplierParamsSchema, updateSupplierSchema } from './suppliers.validator';

export const suppliersRoutes = Router();
suppliersRoutes.get('/', validate(supplierListQuerySchema, 'query'), SuppliersController.list);
suppliersRoutes.post('/', requireSupplierAdmin, validate(createSupplierSchema), SuppliersController.create);
suppliersRoutes.get('/:supplierId/summary', validate(supplierParamsSchema, 'params'), SuppliersController.summary);
suppliersRoutes.get('/:supplierId/audit', requireSupplierAdmin, validate(supplierParamsSchema, 'params'), validate(supplierAuditQuerySchema, 'query'), SuppliersController.audit);
suppliersRoutes.post('/:supplierId/archive', requireSupplierAdmin, validate(supplierParamsSchema, 'params'), validate(supplierActionSchema), SuppliersController.archive);
suppliersRoutes.post('/:supplierId/restore', requireSupplierAdmin, validate(supplierParamsSchema, 'params'), validate(supplierActionSchema), SuppliersController.restore);
suppliersRoutes.patch('/:supplierId', requireSupplierAdmin, validate(supplierParamsSchema, 'params'), validate(updateSupplierSchema), SuppliersController.update);
suppliersRoutes.delete('/:supplierId', requireSupplierAdmin, validate(supplierParamsSchema, 'params'), validate(supplierActionSchema), SuppliersController.delete);
suppliersRoutes.get('/:supplierId', validate(supplierParamsSchema, 'params'), SuppliersController.get);
