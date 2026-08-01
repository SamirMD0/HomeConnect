import { NextFunction, Request, Response } from 'express';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierInput, SupplierActionInput, SupplierAuditQueryInput, SupplierListQueryInput, SupplierParamsInput, UpdateSupplierInput } from './suppliers.validator';

const context = (req: { headers: Request['headers']; ip?: string }) => ({ requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null, ipAddress: req.ip ?? null });
export class SuppliersController {
  static async create(req: Request<unknown, unknown, CreateSupplierInput>, res: Response, next: NextFunction) { try { res.status(201).json({ success: true, data: await SuppliersService.create(req.body, req.user!, context(req)) }); } catch (e) { next(e); } }
  static async list(req: Request, res: Response, next: NextFunction) { try { const r = await SuppliersService.list(req.query as unknown as SupplierListQueryInput); res.json({ success: true, data: r.items, meta: { pagination: { page: r.page, pageSize: r.pageSize, totalItems: r.total, totalPages: Math.ceil(r.total / r.pageSize) } } }); } catch (e) { next(e); } }
  static async get(req: Request<SupplierParamsInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await SuppliersService.get(req.params.supplierId) }); } catch (e) { next(e); } }
  static async summary(req: Request<SupplierParamsInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await SuppliersService.summary(req.params.supplierId) }); } catch (e) { next(e); } }
  static async update(req: Request<SupplierParamsInput, unknown, UpdateSupplierInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await SuppliersService.update(req.params.supplierId, req.body, req.user!, context(req)) }); } catch (e) { next(e); } }
  static async archive(req: Request<SupplierParamsInput, unknown, SupplierActionInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await SuppliersService.archive(req.params.supplierId, req.body, req.user!, context(req)) }); } catch (e) { next(e); } }
  static async restore(req: Request<SupplierParamsInput, unknown, SupplierActionInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await SuppliersService.restore(req.params.supplierId, req.body, req.user!, context(req)) }); } catch (e) { next(e); } }
  static async delete(req: Request<SupplierParamsInput, unknown, SupplierActionInput>, res: Response, next: NextFunction) { try { res.json({ success: true, data: await SuppliersService.delete(req.params.supplierId, req.body, req.user!, context(req)) }); } catch (e) { next(e); } }
  static async audit(req: Request<SupplierParamsInput>, res: Response, next: NextFunction) { try { const r = await SuppliersService.audit(req.params.supplierId, req.query as unknown as SupplierAuditQueryInput); res.json({ success: true, data: r.items, meta: { pagination: { page: r.page, pageSize: r.pageSize, totalItems: r.total, totalPages: Math.ceil(r.total / r.pageSize) } } }); } catch (e) { next(e); } }
}
