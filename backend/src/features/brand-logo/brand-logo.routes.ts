import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { requirePricingAdmin } from '../pricing/authorization/pricing-policy';
import { BrandLogoController } from './brand-logo.controller';
import { archiveBrandLogoSchema, brandLogoListQuerySchema, brandLogoParamsSchema, createBrandLogoSchema, updateBrandLogoSchema } from './brand-logo.validator';

export const brandLogoRoutes = Router();
brandLogoRoutes.get('/', validate(brandLogoListQuerySchema, 'query'), BrandLogoController.list);
brandLogoRoutes.post('/', requirePricingAdmin, validate(createBrandLogoSchema), BrandLogoController.create);
brandLogoRoutes.patch('/:brandLogoId', requirePricingAdmin, validate(brandLogoParamsSchema, 'params'), validate(updateBrandLogoSchema), BrandLogoController.update);
brandLogoRoutes.post('/:brandLogoId/archive', requirePricingAdmin, validate(brandLogoParamsSchema, 'params'), validate(archiveBrandLogoSchema), BrandLogoController.archive);
