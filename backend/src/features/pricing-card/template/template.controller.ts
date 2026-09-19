import { NextFunction, Request, Response } from 'express';
import { PricingCardTemplateService } from './template.service';
import { ArchivePricingCardTemplateInput, PricingCardTemplateInput } from './template.validator';
const context = (req: { headers: Request['headers']; ip?: string }) => ({ requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null, ipAddress: req.ip ?? null });
export class PricingCardTemplateController {
  static async list(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await PricingCardTemplateService.listTemplates(req.query as unknown as { activeOnly: boolean }) }); } catch (error) { next(error); } }
  static async get(req: Request<{ templateId: string }>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await PricingCardTemplateService.getTemplate(req.params.templateId) }); } catch (error) { next(error); } }
  static async create(req: Request<unknown, unknown, PricingCardTemplateInput>, res: Response, next: NextFunction) { try { res.status(201).json({ success: true, data: await PricingCardTemplateService.createTemplate(req.body, req.user!, context(req)) }); } catch (error) { next(error); } }
  static async update(req: Request<{ templateId: string }, unknown, PricingCardTemplateInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await PricingCardTemplateService.updateTemplate(req.params.templateId, req.body, req.user!, context(req)) }); } catch (error) { next(error); } }
  static async archive(req: Request<{ templateId: string }, unknown, ArchivePricingCardTemplateInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await PricingCardTemplateService.archiveTemplate(req.params.templateId, req.body, req.user!, context(req)) }); } catch (error) { next(error); } }
}
