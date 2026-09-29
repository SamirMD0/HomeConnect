import type { NextFunction, Request, Response } from 'express';
import { ProductImportService } from './product-import.service';
import type {
  CommitProductImportInput,
  CreateProductImportInput,
  ProductImportParamsInput,
  UpdateProductImportInput,
} from './product-import.validator';

const contextFrom = (req: Request) => ({
  requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null,
  ipAddress: req.ip ?? null,
});

export class ProductImportController {
  static async create(req: Request<unknown, unknown, CreateProductImportInput>, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: await ProductImportService.createDraft(req.body, req.user!) }); }
    catch (error) { next(error); }
  }

  static async get(req: Request<ProductImportParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductImportService.getDraft(req.params.importId, req.user!) }); }
    catch (error) { next(error); }
  }

  static async update(req: Request<ProductImportParamsInput, unknown, UpdateProductImportInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductImportService.updateDraft(req.params.importId, req.body, req.user!) }); }
    catch (error) { next(error); }
  }

  static async commit(req: Request<ProductImportParamsInput, unknown, CommitProductImportInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductImportService.commit(req.params.importId, req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
}
