import { Router } from 'express';
import { requireAccountPassword } from '../../middleware/admin-password.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requirePricingAdmin } from '../pricing/authorization/pricing-policy';
import { BrandLogoController } from './brand-logo.controller';
import { archiveBrandLogoSchema, brandLogoListQuerySchema, brandLogoParamsSchema, createBrandLogoSchema, updateBrandLogoSchema } from './brand-logo.validator';

export const brandLogoRoutes = Router();
brandLogoRoutes.get('/', validate(brandLogoListQuerySchema, 'query'), BrandLogoController.list);
brandLogoRoutes.post('/', requirePricingAdmin, requireAccountPassword, validate(createBrandLogoSchema), BrandLogoController.create);
brandLogoRoutes.patch('/:brandLogoId', requirePricingAdmin, requireAccountPassword, validate(brandLogoParamsSchema, 'params'), validate(updateBrandLogoSchema), BrandLogoController.update);
brandLogoRoutes.post('/:brandLogoId/archive', requirePricingAdmin, requireAccountPassword, validate(brandLogoParamsSchema, 'params'), validate(archiveBrandLogoSchema), BrandLogoController.archive);
