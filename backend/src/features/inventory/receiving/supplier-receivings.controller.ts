import { NextFunction, Request, Response } from 'express';
import { SupplierReceivingsService } from './supplier-receivings.service';
import {
  CreateSupplierReceivingInput, SupplierReceivingDuplicateInput, SupplierReceivingListInput,
  SupplierReceivingParamsInput, UpdateSupplierReceivingMetadataInput, VoidSupplierReceivingInput,
} from './supplier-receivings.validator';

const contextFrom = (req: Request) => ({
  requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null,
  ipAddress: req.ip ?? null,
});

export class SupplierReceivingsController {
  static async create(req: Request<unknown, unknown, CreateSupplierReceivingInput>, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: await SupplierReceivingsService.create(req.body, req.user!) }); } catch (error) { next(error); }
  }
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await SupplierReceivingsService.list(req.query as unknown as SupplierReceivingListInput, req.user!);
      res.json({ success: true, data: result.items, meta: { pagination: { page: result.page, pageSize: result.pageSize, totalItems: result.total, totalPages: Math.ceil(result.total / result.pageSize) } } });
    } catch (error) { next(error); }
  }
  static async get(req: Request<SupplierReceivingParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SupplierReceivingsService.get(req.params.receivingId, req.user!) }); } catch (error) { next(error); }
  }
  static async duplicateCheck(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SupplierReceivingsService.duplicateCheck(req.query as unknown as SupplierReceivingDuplicateInput, req.user!) }); } catch (error) { next(error); }
  }
  static async updateMetadata(req: Request<SupplierReceivingParamsInput, unknown, UpdateSupplierReceivingMetadataInput>, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await SupplierReceivingsService.updateMetadata(req.params.receivingId, req.body, req.user!, contextFrom(req)) });
    } catch (error) { next(error); }
  }
  static async void(req: Request<SupplierReceivingParamsInput, unknown, VoidSupplierReceivingInput>, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await SupplierReceivingsService.void(req.params.receivingId, req.body, req.user!, contextFrom(req)) });
    } catch (error) { next(error); }
  }
}
