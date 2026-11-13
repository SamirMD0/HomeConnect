import { version } from '../../../../package.json';
import { Router } from 'express';
import { SystemController } from './system.controller';

export const systemRoutes = Router();

// Any signed-in user, not just an admin: the status strip is shown to everyone
// who can open the app, and it reveals nothing an employee cannot already see.
systemRoutes.get('/local-status', SystemController.localStatus);

export const MIN_MOBILE_VERSION = '1.2.0';
export const clientCompatRoutes = Router();
clientCompatRoutes.get('/', (_req, res) => {
  res
    .set('Cache-Control', 'no-store')
    .json({ success: true, data: { apiVersion: version, minMobileVersion: MIN_MOBILE_VERSION } });
});
