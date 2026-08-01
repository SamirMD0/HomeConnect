import { NextFunction, Request, Response } from 'express';
import { ProductsService } from './products.service';
import { assertProductImageBytes, assertProductImageMimeType } from './product-image';
import {
  CreateProductInput, ProductActionInput, ProductAuditQueryInput,
  ProductDuplicateQueryInput, ProductListQueryInput, ProductParamsInput,
  ProductServiceJobsQueryInput, UpdateProductInput,
  UpdateProductPricingInput, ProductPricingPreviewQueryInput,
  ProductLabelQueryInput, UpdateProductSkuInput, UpdateProductStockInput,
} from './products.validator';

const contextFrom = (req: { headers: Request['headers']; ip?: string }) => ({
  requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null,
  ipAddress: req.ip ?? null,
});

export class ProductsController {
  static async create(req: Request<unknown, unknown, CreateProductInput>, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: await ProductsService.create(req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async image(req: Request<ProductParamsInput>, res: Response, next: NextFunction) {
    try {
      const image = await ProductsService.getImage(req.params.productId);
      const etag = `W/"${req.params.productId}-${image.updatedAt.getTime()}"`;
      if (req.headers['if-none-match'] === etag) { res.status(304).end(); return; }
      res.setHeader('Content-Type', image.mimeType);
      res.setHeader('Content-Length', String(image.byteSize));
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      res.setHeader('ETag', etag);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(image.data);
    } catch (error) { next(error); }
  }
  static async uploadImage(req: Request<ProductParamsInput>, res: Response, next: NextFunction) {
    try {
      const mimeType = assertProductImageMimeType(req.headers['content-type']);
      const data = assertProductImageBytes(req.body as Buffer, mimeType);
      res.json({ success: true, data: await ProductsService.uploadImage(req.params.productId, { data, mimeType }, req.user!, contextFrom(req)) });
    } catch (error) { next(error); }
  }
  static async removeImage(req: Request<ProductParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.removeImage(req.params.productId, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ProductsService.list(req.query as unknown as ProductListQueryInput, req.user);
      res.json({ success: true, data: result.items, meta: { pagination: { page: result.page, pageSize: result.pageSize, totalItems: result.total, totalPages: Math.ceil(result.total / result.pageSize) } } });
    } catch (error) { next(error); }
  }
  static async get(req: Request<ProductParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.get(req.params.productId, req.user) }); }
    catch (error) { next(error); }
  }
  static async pricingPreview(req: Request<ProductParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.getPricingPreview(req.params.productId, req.query as unknown as ProductPricingPreviewQueryInput, req.user) }); }
    catch (error) { next(error); }
  }
  static async updatePricing(req: Request<ProductParamsInput, unknown, UpdateProductPricingInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.updatePricing(req.params.productId, req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async update(req: Request<ProductParamsInput, unknown, UpdateProductInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.update(req.params.productId, req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async archive(req: Request<ProductParamsInput, unknown, ProductActionInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.archive(req.params.productId, req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async restore(req: Request<ProductParamsInput, unknown, ProductActionInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.restore(req.params.productId, req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async label(req: Request<ProductParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.label(req.params.productId, req.query as unknown as ProductLabelQueryInput) }); }
    catch (error) { next(error); }
  }
  static async updateSku(req: Request<ProductParamsInput, unknown, UpdateProductSkuInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.updateSku(req.params.productId, req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async regenerateSku(req: Request<ProductParamsInput, unknown, ProductActionInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.regenerateSku(req.params.productId, req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async updateStock(req: Request<ProductParamsInput, unknown, UpdateProductStockInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.updateStock(req.params.productId, req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async audit(req: Request<ProductParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.audit(req.params.productId, req.query as unknown as ProductAuditQueryInput) }); }
    catch (error) { next(error); }
  }
  static async checkDuplicate(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ProductsService.checkDuplicate(req.query as unknown as ProductDuplicateQueryInput) }); }
    catch (error) { next(error); }
  }
  static async serviceJobs(req: Request<ProductParamsInput>, res: Response, next: NextFunction) {
    try {
      const result = await ProductsService.serviceJobs(req.params.productId, req.query as unknown as ProductServiceJobsQueryInput);
      res.json({ success: true, data: result.items, meta: { pagination: { page: result.page, pageSize: result.pageSize, totalItems: result.total, totalPages: Math.ceil(result.total / result.pageSize) } } });
    } catch (error) { next(error); }
  }
}
