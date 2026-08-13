import type { NextFunction, Request, Response } from 'express';
import { SalesOrdersService } from './sales-orders.service';
import { SalesOrderInventoryService } from './sales-order-inventory.service';
import type {
  AddSalesOrderItemInput,
  ChangeSalesOrderPaymentInput,
  ChangeSalesOrderStatusInput,
  CreateSalesOrderDebtInput,
  CreateSalesOrderInput,
  CreateSalesOrderInstallmentPlanInput,
  CustomerSalesOrdersParamsInput,
  DeductSalesOrderStockInput,
  RestoreSalesOrderInput,
  RestoreSalesOrderStockInput,
  SalesAuditQueryInput,
  SalesOrderActionInput,
  SalesOrderItemParamsInput,
  SalesOrderItemActionInput,
  SalesOrderListQueryInput,
  SalesOrderParamsInput,
  UpdateSalesOrderInput,
  UpdateSalesOrderItemInput,
} from './sales-orders.validator';

const contextFrom = (req: { headers: Request['headers']; ip?: string }) => ({
  requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null,
  ipAddress: req.ip ?? null,
});

function paginated(result: { items: unknown[]; total: number; page: number; pageSize: number }) {
  return {
    success: true,
    data: result.items,
    meta: { pagination: { page: result.page, pageSize: result.pageSize, totalItems: result.total, totalPages: Math.ceil(result.total / result.pageSize) } },
  };
}

export class SalesOrdersController {
  static async create(req: Request<unknown, unknown, CreateSalesOrderInput>, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: await SalesOrdersService.create(req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async list(req: Request, res: Response, next: NextFunction) {
    try { res.json(paginated(await SalesOrdersService.list(req.query as unknown as SalesOrderListQueryInput))); } catch (error) { next(error); }
  }
  static async listCustomer(req: Request<CustomerSalesOrdersParamsInput>, res: Response, next: NextFunction) {
    try { res.json(paginated(await SalesOrdersService.list({ ...(req.query as unknown as SalesOrderListQueryInput), customerId: req.params.customerId }))); } catch (error) { next(error); }
  }
  static async get(req: Request<SalesOrderParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SalesOrdersService.get(req.params.salesOrderId) }); } catch (error) { next(error); }
  }
  static async summary(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SalesOrdersService.summary(req.query as never) }); } catch (error) { next(error); }
  }
  static async update(req: Request<SalesOrderParamsInput, unknown, UpdateSalesOrderInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SalesOrdersService.update(req.params.salesOrderId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async addItem(req: Request<SalesOrderParamsInput, unknown, AddSalesOrderItemInput>, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: await SalesOrdersService.addItem(req.params.salesOrderId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async updateItem(req: Request<SalesOrderItemParamsInput, unknown, UpdateSalesOrderItemInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SalesOrdersService.updateItem(req.params.salesOrderId, req.params.itemId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async removeItem(req: Request<SalesOrderItemParamsInput, unknown, SalesOrderItemActionInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SalesOrdersService.removeItem(req.params.salesOrderId, req.params.itemId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async deductStock(req: Request<SalesOrderParamsInput, unknown, DeductSalesOrderStockInput>, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: await SalesOrderInventoryService.deductStock(req.params.salesOrderId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async restoreStock(req: Request<SalesOrderParamsInput, unknown, RestoreSalesOrderStockInput>, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: await SalesOrderInventoryService.restoreStock(req.params.salesOrderId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async status(req: Request<SalesOrderParamsInput, unknown, ChangeSalesOrderStatusInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SalesOrdersService.changeStatus(req.params.salesOrderId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async payment(req: Request<SalesOrderParamsInput, unknown, ChangeSalesOrderPaymentInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SalesOrdersService.changePayment(req.params.salesOrderId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async cancel(req: Request<SalesOrderParamsInput, unknown, SalesOrderActionInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SalesOrdersService.cancel(req.params.salesOrderId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async restore(req: Request<SalesOrderParamsInput, unknown, RestoreSalesOrderInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SalesOrdersService.restore(req.params.salesOrderId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async returnOrder(req: Request<SalesOrderParamsInput, unknown, SalesOrderActionInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SalesOrdersService.returnOrder(req.params.salesOrderId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async createDebt(req: Request<SalesOrderParamsInput, unknown, CreateSalesOrderDebtInput>, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: await SalesOrdersService.createDebt(req.params.salesOrderId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async createInstallmentPlan(req: Request<SalesOrderParamsInput, unknown, CreateSalesOrderInstallmentPlanInput>, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: await SalesOrdersService.createInstallmentPlan(req.params.salesOrderId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async unlinkFinancial(req: Request<SalesOrderParamsInput, unknown, SalesOrderActionInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SalesOrdersService.unlinkFinancial(req.params.salesOrderId, req.body, req.user!, contextFrom(req)) }); } catch (error) { next(error); }
  }
  static async audit(req: Request<SalesOrderParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await SalesOrdersService.audit(req.params.salesOrderId, req.query as unknown as SalesAuditQueryInput) }); } catch (error) { next(error); }
  }
}
