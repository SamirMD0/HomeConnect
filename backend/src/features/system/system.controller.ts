import { NextFunction, Request, Response } from 'express';
import { SystemService } from './system.service';

export class SystemController {
  static async localStatus(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SystemService.localStatus() }); }
    catch (error) { next(error); }
  }
}
