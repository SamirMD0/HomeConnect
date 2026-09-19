import { Router } from 'express';
import { requireAccountPassword } from '../../../middleware/admin-password.middleware';
import { validate } from '../../../middleware/validate.middleware';
import { requireServiceAdmin } from '../../service/authorization/service-policy';
import { PrintSnapshotController } from './print-snapshot.controller';
import { printSnapshotListQuerySchema, printSnapshotProductParamsSchema, recordPrintSnapshotSchema } from './print-snapshot.validator';

export const printSnapshotRoutes = Router();
printSnapshotRoutes.post('/', requireServiceAdmin, requireAccountPassword, validate(recordPrintSnapshotSchema), PrintSnapshotController.record);
printSnapshotRoutes.get('/product/:productId', validate(printSnapshotProductParamsSchema, 'params'), validate(printSnapshotListQuerySchema, 'query'), PrintSnapshotController.listForProduct);
