import { NextFunction, Request, Response } from 'express';
import { BrandLogoService } from './brand-logo.service';
import { ArchiveBrandLogoInput, BrandLogoInput } from './brand-logo.validator';

const context = (req: { headers: Request['headers']; ip?: string }) => ({ requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null, ipAddress: req.ip ?? null });

export class BrandLogoController {
  static async list(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await BrandLogoService.listBrandLogos(req.query as unknown as { activeOnly: boolean }) }); } catch (error) { next(error); } }
  static async create(req: Request<unknown, unknown, BrandLogoInput>, res: Response, next: NextFunction) { try { res.status(201).json({ success: true, data: await BrandLogoService.createBrandLogo(req.body, req.user!, context(req)) }); } catch (error) { next(error); } }
  static async update(req: Request<{ brandLogoId: string }, unknown, BrandLogoInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await BrandLogoService.updateBrandLogo(req.params.brandLogoId, req.body, req.user!, context(req)) }); } catch (error) { next(error); } }
  static async archive(req: Request<{ brandLogoId: string }, unknown, ArchiveBrandLogoInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await BrandLogoService.archiveBrandLogo(req.params.brandLogoId, req.body, req.user!, context(req)) }); } catch (error) { next(error); } }
}
