import { Router } from 'express';
import { requireRole } from '../../middleware/role.middleware';
import { PreflightController } from './preflight.controller';

export const preflightRoutes = Router();

// Admin-only: the report names the database, host and port, and lists exactly
// which structures are missing. Read-only, but not something an employee needs.
preflightRoutes.use(requireRole(['ADMIN']));

preflightRoutes.get('/', PreflightController.run);
