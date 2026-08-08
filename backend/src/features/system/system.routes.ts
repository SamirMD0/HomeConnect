import { Router } from 'express';
import { SystemController } from './system.controller';

export const systemRoutes = Router();

// Any signed-in user, not just an admin: the status strip is shown to everyone
// who can open the app, and it reveals nothing an employee cannot already see.
systemRoutes.get('/local-status', SystemController.localStatus);
