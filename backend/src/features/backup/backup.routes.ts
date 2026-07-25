import { Router } from 'express';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { BackupController } from './backup.controller';
import {
  backupIdParamsSchema,
  backupListQuerySchema,
  createBackupSchema,
  restoreBackupSchema,
  updateBackupSettingsSchema,
} from './backup.validator';

export const backupRoutes = Router();

backupRoutes.use(requireRole(['ADMIN']));

backupRoutes.get('/status', BackupController.getStatus);
backupRoutes.get('/settings', BackupController.getSettings);
backupRoutes.put('/settings', validate(updateBackupSettingsSchema), BackupController.updateSettings);
backupRoutes.get('/', validate(backupListQuerySchema, 'query'), BackupController.listBackups);
backupRoutes.post('/', validate(createBackupSchema), BackupController.createBackup);
backupRoutes.post(
  '/:backupId/validate-restore',
  validate(backupIdParamsSchema, 'params'),
  BackupController.validateRestore
);
backupRoutes.post(
  '/:backupId/restore',
  validate(backupIdParamsSchema, 'params'),
  validate(restoreBackupSchema),
  BackupController.restoreBackup
);
