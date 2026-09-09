import { Router } from 'express';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { BusinessSettingsController } from './business-settings.controller';
import { updateBusinessSettingsSchema } from './business-settings.validator';

export const businessSettingsRoutes = Router();

businessSettingsRoutes.get('/', BusinessSettingsController.get);
businessSettingsRoutes.put('/', requireRole(['ADMIN']), validate(updateBusinessSettingsSchema), BusinessSettingsController.update);
