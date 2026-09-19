import { NextFunction, Request, Response } from 'express';
import { ShopProfileService } from './shop-profile.service';
import { UpdateShopProfileInput, UpdateShopProfileLogoInput } from './shop-profile.validator';

const context = (req: { headers: Request['headers']; ip?: string }) => ({
  requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null,
  ipAddress: req.ip ?? null,
});

export class ShopProfileController {
  static async get(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ShopProfileService.getShopProfile() }); } catch (error) { next(error); }
  }

  static async update(req: Request<unknown, unknown, UpdateShopProfileInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ShopProfileService.updateShopProfile(req.body, req.user!, context(req)) }); } catch (error) { next(error); }
  }

  static async updateLogo(req: Request<unknown, unknown, UpdateShopProfileLogoInput>, res: Response, next: NextFunction) {
    try {
      const bytes = Buffer.from(req.body.dataBase64, 'base64');
      res.json({ success: true, data: await ShopProfileService.updateShopProfileLogo(bytes, req.body.mimeType, req.body.accountPassword, req.user!, context(req)) });
    } catch (error) { next(error); }
  }
}
