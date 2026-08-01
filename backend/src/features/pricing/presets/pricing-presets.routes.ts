import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { requirePricingAdmin } from '../authorization/pricing-policy';
import { PricingPresetsController } from './pricing-presets.controller';
import { createPricingPresetSchema, pricingPresetActionSchema, pricingPresetAuditQuerySchema, pricingPresetListQuerySchema, pricingPresetParamsSchema, updatePricingPresetSchema } from './pricing-presets.validator';

export const pricingPresetsRoutes = Router();
pricingPresetsRoutes.get('/', validate(pricingPresetListQuerySchema, 'query'), PricingPresetsController.list);
pricingPresetsRoutes.post('/', requirePricingAdmin, validate(createPricingPresetSchema), PricingPresetsController.create);
pricingPresetsRoutes.get('/:presetId/audit', requirePricingAdmin, validate(pricingPresetParamsSchema, 'params'), validate(pricingPresetAuditQuerySchema, 'query'), PricingPresetsController.audit);
pricingPresetsRoutes.post('/:presetId/archive', requirePricingAdmin, validate(pricingPresetParamsSchema, 'params'), validate(pricingPresetActionSchema), PricingPresetsController.archive);
pricingPresetsRoutes.post('/:presetId/restore', requirePricingAdmin, validate(pricingPresetParamsSchema, 'params'), validate(pricingPresetActionSchema), PricingPresetsController.restore);
pricingPresetsRoutes.post('/:presetId/set-default', requirePricingAdmin, validate(pricingPresetParamsSchema, 'params'), validate(pricingPresetActionSchema), PricingPresetsController.setDefault);
pricingPresetsRoutes.patch('/:presetId', requirePricingAdmin, validate(pricingPresetParamsSchema, 'params'), validate(updatePricingPresetSchema), PricingPresetsController.update);
pricingPresetsRoutes.get('/:presetId', validate(pricingPresetParamsSchema, 'params'), PricingPresetsController.get);
