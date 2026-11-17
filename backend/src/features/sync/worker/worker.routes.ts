import { Router } from 'express';
import { requireRole } from '../../../middleware/role.middleware';
import { validate } from '../../../middleware/validate.middleware';
import { workerSettingsSchema, saveWorkerSettings, workerStatus } from './worker-settings';
import { requestWorkerCycle } from './worker-control';
import { AppError } from '../../../lib/errors';
import { z } from 'zod';
import { pairDeviceSchema, pairDevice, pairedDevices, pairingOptions, revokeDevice } from './worker-devices';

const safeSettingsError = (error: unknown) => error instanceof AppError ? error :
  new AppError('Cloud sync settings are unavailable. Please try again.', 503, 'SYNC_SETTINGS_UNAVAILABLE');

export const workerRoutes = Router();
workerRoutes.use(requireRole(['ADMIN']));
workerRoutes.get('/devices/options', async (_req, res, next) => {
  try { res.json({ success: true, data: await pairingOptions() }); } catch (error) { next(safeSettingsError(error)); }
});
workerRoutes.get('/devices', async (_req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json({ success: true, data: await pairedDevices() }); } catch (error) { next(safeSettingsError(error)); }
});
workerRoutes.post('/devices', validate(pairDeviceSchema), async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').status(201).json({ success: true, data: await pairDevice(req.body) }); } catch (error) { next(safeSettingsError(error)); }
});
workerRoutes.post('/devices/:id/revoke', validate(z.object({ id: z.string().uuid() }), 'params'), async (req, res, next) => {
  try { res.json({ success: true, data: await revokeDevice(String(req.params.id)) }); } catch (error) { next(safeSettingsError(error)); }
});
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
