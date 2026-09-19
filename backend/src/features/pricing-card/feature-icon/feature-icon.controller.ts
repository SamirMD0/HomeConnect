import { NextFunction, Request, Response } from 'express';
import { FeatureIconService } from './feature-icon.service';
import { ArchiveFeatureIconInput, FeatureIconInput } from './feature-icon.validator';
const context = (req: { headers: Request['headers']; ip?: string }) => ({ requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null, ipAddress: req.ip ?? null });
export class FeatureIconController {
  static async list(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await FeatureIconService.listFeatureIcons(req.query as unknown as { activeOnly?: boolean; category?: string }) }); } catch (error) { next(error); } }
  static async create(req: Request<unknown, unknown, FeatureIconInput>, res: Response, next: NextFunction) { try { res.status(201).json({ success: true, data: await FeatureIconService.createFeatureIcon(req.body, req.user!, context(req)) }); } catch (error) { next(error); } }
  static async update(req: Request<{ featureIconId: string }, unknown, FeatureIconInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await FeatureIconService.updateFeatureIcon(req.params.featureIconId, req.body, req.user!, context(req)) }); } catch (error) { next(error); } }
  static async archive(req: Request<{ featureIconId: string }, unknown, ArchiveFeatureIconInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await FeatureIconService.archiveFeatureIcon(req.params.featureIconId, req.body, req.user!, context(req)) }); } catch (error) { next(error); } }
}
