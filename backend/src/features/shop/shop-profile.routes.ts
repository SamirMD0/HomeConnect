import { Router } from 'express';
import { requirePricingAdmin } from '../pricing/authorization/pricing-policy';
import { validate } from '../../middleware/validate.middleware';
import { ShopProfileController } from './shop-profile.controller';
import { updateShopProfileLogoSchema, updateShopProfileSchema } from './shop-profile.validator';

export const shopProfileRoutes = Router();

shopProfileRoutes.get('/', ShopProfileController.get);
shopProfileRoutes.patch('/', requirePricingAdmin, validate(updateShopProfileSchema), ShopProfileController.update);
shopProfileRoutes.put('/logo', requirePricingAdmin, validate(updateShopProfileLogoSchema), ShopProfileController.updateLogo);
