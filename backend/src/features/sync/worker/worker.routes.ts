import { Router } from 'express';
import { requireRole } from '../../../middleware/role.middleware';
import { validate } from '../../../middleware/validate.middleware';
import { workerSettingsSchema, saveWorkerSettings, workerStatus } from './worker-settings';
import { requestWorkerCycle } from './worker-control';
import { AppError } from '../../../lib/errors';

const safeSettingsError = (error: unknown) => error instanceof AppError ? error :
  new AppError('Cloud sync settings are unavailable. Please try again.', 503, 'SYNC_SETTINGS_UNAVAILABLE');

export const workerRoutes = Router();
workerRoutes.use(requireRole(['ADMIN']));
workerRoutes.get('/', async (_req, res, next) => {
  try { res.json({ success: true, data: await workerStatus() }); } catch (error) { next(safeSettingsError(error)); }
});
workerRoutes.put('/', validate(workerSettingsSchema), async (req, res, next) => {
  try {
    const data = await saveWorkerSettings(req.body);
    requestWorkerCycle();
    res.json({ success: true, data });
  } catch (error) { next(safeSettingsError(error)); }
});
workerRoutes.post('/run-now', (_req, res) => {
  requestWorkerCycle();
  res.status(202).json({ success: true, data: { queued: true } });
});
