import { Role } from '@prisma/client';
import { Router } from 'express';
import { requireRole } from '../../../middleware/role.middleware';
import { validate } from '../../../middleware/validate.middleware';
import { SupplierReceivingsController } from './supplier-receivings.controller';
import {
  createSupplierReceivingSchema, supplierReceivingDuplicateSchema, supplierReceivingListSchema,
  supplierReceivingParamsSchema, updateSupplierReceivingMetadataSchema, voidSupplierReceivingSchema,
} from './supplier-receivings.validator';

const allowed = requireRole([Role.ADMIN, Role.EMPLOYEE]);
// Employees receive stock and read documents. Correcting a document that already
// posted — and giving its stock back — is an admin act, and there is deliberately
// no DELETE route on this router: posted inventory history is never erased.
const adminOnly = requireRole([Role.ADMIN]);
export const supplierReceivingsRoutes = Router();
supplierReceivingsRoutes.get('/duplicate-check', allowed, validate(supplierReceivingDuplicateSchema, 'query'), SupplierReceivingsController.duplicateCheck);
supplierReceivingsRoutes.get('/', allowed, validate(supplierReceivingListSchema, 'query'), SupplierReceivingsController.list);
supplierReceivingsRoutes.post('/', allowed, validate(createSupplierReceivingSchema), SupplierReceivingsController.create);
supplierReceivingsRoutes.get('/:receivingId', allowed, validate(supplierReceivingParamsSchema, 'params'), SupplierReceivingsController.get);
supplierReceivingsRoutes.patch('/:receivingId/metadata', adminOnly, validate(supplierReceivingParamsSchema, 'params'), validate(updateSupplierReceivingMetadataSchema), SupplierReceivingsController.updateMetadata);
supplierReceivingsRoutes.post('/:receivingId/void', adminOnly, validate(supplierReceivingParamsSchema, 'params'), validate(voidSupplierReceivingSchema), SupplierReceivingsController.void);
