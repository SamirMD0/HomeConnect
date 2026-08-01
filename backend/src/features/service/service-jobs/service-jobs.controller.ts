import { NextFunction, Request, Response } from 'express';
import { ServiceJobsService } from './service-jobs.service';
import {
  CancelServiceJobInput, ChangeServiceStatusInput, CreateServiceJobInput,
  CustomerServiceJobsParamsInput, ReopenServiceJobInput, ServiceAuditQueryInput,
  ServiceJobListQueryInput, ServiceJobParamsInput, UpdateServiceJobInput,
} from './service-jobs.validator';

const contextFrom = (req: { headers: Request['headers']; ip?: string }) => ({
  requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null,
  ipAddress: req.ip ?? null,
});

export class ServiceJobsController {
  static async create(req: Request<unknown, unknown, CreateServiceJobInput>, res: Response, next: NextFunction) {
    try { res.status(201).json({ success: true, data: await ServiceJobsService.create(req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ServiceJobsService.list(req.query as unknown as ServiceJobListQueryInput);
      res.json({ success: true, data: result.items, meta: { pagination: { page: result.page, pageSize: result.pageSize, totalItems: result.total, totalPages: Math.ceil(result.total / result.pageSize) } } });
    } catch (error) { next(error); }
  }
  static async listCustomer(req: Request<CustomerServiceJobsParamsInput>, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as ServiceJobListQueryInput;
      const result = await ServiceJobsService.list({ ...query, customerId: req.params.customerId });
      res.json({ success: true, data: result.items, meta: { pagination: { page: result.page, pageSize: result.pageSize, totalItems: result.total, totalPages: Math.ceil(result.total / result.pageSize) } } });
    } catch (error) { next(error); }
  }
  static async get(req: Request<ServiceJobParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ServiceJobsService.get(req.params.serviceJobId) }); }
    catch (error) { next(error); }
  }
  static async update(req: Request<ServiceJobParamsInput, unknown, UpdateServiceJobInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ServiceJobsService.update(req.params.serviceJobId, req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async status(req: Request<ServiceJobParamsInput, unknown, ChangeServiceStatusInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ServiceJobsService.changeStatus(req.params.serviceJobId, req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async cancel(req: Request<ServiceJobParamsInput, unknown, CancelServiceJobInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ServiceJobsService.cancel(req.params.serviceJobId, req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async reopen(req: Request<ServiceJobParamsInput, unknown, ReopenServiceJobInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ServiceJobsService.reopen(req.params.serviceJobId, req.body, req.user!, contextFrom(req)) }); }
    catch (error) { next(error); }
  }
  static async audit(req: Request<ServiceJobParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ServiceJobsService.audit(req.params.serviceJobId, req.query as unknown as ServiceAuditQueryInput) }); }
    catch (error) { next(error); }
  }
  static async summary(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ServiceJobsService.summary() }); }
    catch (error) { next(error); }
  }
}
