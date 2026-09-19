import { NextFunction, Request, Response, Router } from 'express';
import { AuthenticationError } from '../../lib/errors';
import { requirePricingAdmin } from '../pricing/authorization/pricing-policy';
import { validate } from '../../middleware/validate.middleware';
import { ShopProfileController } from './shop-profile.controller';
import { updateShopProfileLogoSchema, updateShopProfileSchema } from './shop-profile.validator';

export const shopProfileRoutes = Router();

const requireAccountPassword = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.body || typeof req.body.accountPassword !== 'string' || req.body.accountPassword.length === 0) {
    return next(new AuthenticationError('Account password is required'));
  }
  next();
};

shopProfileRoutes.get('/', ShopProfileController.get);
shopProfileRoutes.patch('/', requirePricingAdmin, requireAccountPassword, validate(updateShopProfileSchema), ShopProfileController.update);
shopProfileRoutes.put('/logo', requirePricingAdmin, requireAccountPassword, validate(updateShopProfileLogoSchema), ShopProfileController.updateLogo);
