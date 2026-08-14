import { Role } from '@prisma/client';
import { Router } from 'express';
import { requireRole } from '../../../middleware/role.middleware';
import { validate } from '../../../middleware/validate.middleware';
import { SupplierReceivingsController } from './supplier-receivings.controller';
import { createSupplierReceivingSchema, supplierReceivingDuplicateSchema, supplierReceivingListSchema, supplierReceivingParamsSchema } from './supplier-receivings.validator';

const allowed = requireRole([Role.ADMIN, Role.EMPLOYEE]);
export const supplierReceivingsRoutes = Router();
supplierReceivingsRoutes.get('/duplicate-check', allowed, validate(supplierReceivingDuplicateSchema, 'query'), SupplierReceivingsController.duplicateCheck);
supplierReceivingsRoutes.get('/', allowed, validate(supplierReceivingListSchema, 'query'), SupplierReceivingsController.list);
supplierReceivingsRoutes.post('/', allowed, validate(createSupplierReceivingSchema), SupplierReceivingsController.create);
supplierReceivingsRoutes.get('/:receivingId', allowed, validate(supplierReceivingParamsSchema, 'params'), SupplierReceivingsController.get);
