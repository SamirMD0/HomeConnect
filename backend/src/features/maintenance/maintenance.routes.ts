import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { applyRepairsSchema, MaintenanceController, resolveMigrationsSchema } from './maintenance.controller';
import { ThermalReconcileNotesService } from './thermal-reconcile-notes.service';

export const maintenanceRoutes = Router();

// Admin-only. The apply route additionally re-verifies the account password
// inside the service, which is rate-limited and logged.
maintenanceRoutes.use(requireRole(['ADMIN']));

maintenanceRoutes.get('/', MaintenanceController.overview);
maintenanceRoutes.post('/apply', validate(applyRepairsSchema), MaintenanceController.applyRepairs);
// Records hand-applied updates as done. Runs no SQL from the migration itself.
maintenanceRoutes.post('/migrations/resolve', validate(resolveMigrationsSchema), MaintenanceController.resolveMigrations);

// Read-only. Surfaces rows written by the pending thermal-template
// reconciliation migration. Returns an empty list with a TABLE_ABSENT hint
// when the migration has not been applied on this database yet, so calling
// this on a fresh install never errors.
maintenanceRoutes.get('/thermal-reconcile-notes', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await ThermalReconcileNotesService.list() });
  } catch (error) { next(error); }
});
