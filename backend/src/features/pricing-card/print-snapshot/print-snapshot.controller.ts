import { NextFunction, Request, Response } from 'express';
import { PrintSnapshotService } from './print-snapshot.service';
import { RecordPrintSnapshotInput } from './print-snapshot.validator';

const context = (req: { headers: Request['headers']; ip?: string }) => ({
  requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null,
  ipAddress: req.ip ?? null,
});

export class PrintSnapshotController {
  static async record(req: Request<unknown, unknown, RecordPrintSnapshotInput>, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: await PrintSnapshotService.recordPrint(req.body, req.user!, context(req)) }); }
    catch (error) { next(error); }
  }
  static async listForProduct(req: Request<{ productId: string }>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await PrintSnapshotService.listPrintsForProduct(req.params.productId, Number(req.query.limit)) }); }
    catch (error) { next(error); }
  }
}
