import { NextFunction, Request, Response } from 'express';
import { SupplierPurchasesService } from './supplier-purchases.service';
import { CreateSupplierPurchaseInput, ReceiptCheckInput, SupplierPurchaseListInput } from './supplier-purchases.validator';

const context = (req: { headers: Request['headers']; ip?: string }) => ({
  requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null,
  ipAddress: req.ip ?? null,
});

export class SupplierPurchasesController {
  static async create(req: Request<{ supplierId: string }, unknown, CreateSupplierPurchaseInput>, res: Response, next: NextFunction) {
    try {
      res.status(201).json({ success: true, data: await SupplierPurchasesService.create(req.params.supplierId, req.body, req.user!, context(req)) });
    } catch (error) { next(error); }
  }

  static async listForSupplier(req: Request<{ supplierId: string }>, res: Response, next: NextFunction) {
    try {
      const result = await SupplierPurchasesService.listForSupplier(req.params.supplierId, req.query as unknown as SupplierPurchaseListInput);
      res.json({ success: true, data: result.items, meta: { pagination: { page: result.page, pageSize: result.pageSize, totalItems: result.total, totalPages: Math.ceil(result.total / result.pageSize) } } });
    } catch (error) { next(error); }
  }

  static async get(req: Request<{ purchaseId: string }>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SupplierPurchasesService.get(req.params.purchaseId) }); } catch (error) { next(error); }
  }

  static async receiptCheck(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SupplierPurchasesService.receiptCheck(req.query as unknown as ReceiptCheckInput) }); } catch (error) { next(error); }
  }
}
