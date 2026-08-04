import { Router } from 'express';
import { requireRole } from '../../middleware/role.middleware';
import { getHealth, getErrors, clearErrors, exportDiagnostics, reportFrontendError } from './diagnostics.controller';
import { requireAuth } from '../../middleware/auth.middleware';

const router = Router();

// Allow any authenticated user to report a frontend crash
router.post('/report-error', requireAuth, reportFrontendError);

// Admin-only diagnostics routes
router.use(requireRole(['ADMIN']));

router.get('/health', getHealth);
router.get('/errors', getErrors);
router.get('/export', exportDiagnostics);
router.post('/clear-errors', clearErrors);

export const diagnosticsRoutes = router;
