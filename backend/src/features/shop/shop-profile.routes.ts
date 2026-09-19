import { Router } from 'express';
import { requirePricingAdmin } from '../pricing/authorization/pricing-policy';
import { validate } from '../../middleware/validate.middleware';
import { requireAccountPassword } from '../../middleware/admin-password.middleware';
import { ShopProfileController } from './shop-profile.controller';
import { updateShopProfileLogoSchema, updateShopProfileSchema } from './shop-profile.validator';

export const shopProfileRoutes = Router();

shopProfileRoutes.get('/', ShopProfileController.get);
shopProfileRoutes.patch('/', requirePricingAdmin, requireAccountPassword, validate(updateShopProfileSchema), ShopProfileController.update);
shopProfileRoutes.put('/logo', requirePricingAdmin, requireAccountPassword, validate(updateShopProfileLogoSchema), ShopProfileController.updateLogo);
