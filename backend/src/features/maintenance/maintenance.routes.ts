import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { applyRepairsSchema, MaintenanceController, resolveMigrationsSchema } from './maintenance.controller';

export const maintenanceRoutes = Router();

// Admin-only. The apply route additionally re-verifies the account password
// inside the service, which is rate-limited and logged.
maintenanceRoutes.use(requireRole(['ADMIN']));

maintenanceRoutes.get('/', MaintenanceController.overview);
maintenanceRoutes.post('/apply', validate(applyRepairsSchema), MaintenanceController.applyRepairs);
// Records hand-applied updates as done. Runs no SQL from the migration itself.
maintenanceRoutes.post('/migrations/resolve', validate(resolveMigrationsSchema), MaintenanceController.resolveMigrations);
