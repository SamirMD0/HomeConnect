import { NextFunction, Request, Response } from 'express';
import { LabelSecretConfigService } from './label-secret-config.service';
import { LabelSecretEncodingInput, UpdateLabelSecretSettingsInput } from './label-secret-config.validator';

const context = (req: { headers: Request['headers']; ip?: string }) => ({ requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null, ipAddress: req.ip ?? null });

export class LabelSecretConfigController {
  static async get(_req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await LabelSecretConfigService.get() }); } catch (error) { next(error); } }
  static async updateSettings(req: Request<unknown, unknown, UpdateLabelSecretSettingsInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await LabelSecretConfigService.updateSettings(req.body, req.user!, context(req)) }); } catch (error) { next(error); } }
  static async createEncoding(req: Request<unknown, unknown, LabelSecretEncodingInput>, res: Response, next: NextFunction) { try { res.status(201).json({ success: true, data: await LabelSecretConfigService.createEncoding(req.body, req.user!, context(req)) }); } catch (error) { next(error); } }
  static async updateEncoding(req: Request<{ encodingId: string }, unknown, LabelSecretEncodingInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await LabelSecretConfigService.updateEncoding(req.params.encodingId, req.body, req.user!, context(req)) }); } catch (error) { next(error); } }
}
