import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { requireServiceAdmin } from '../authorization/service-policy';
import { ServiceJobsController } from './service-jobs.controller';
import {
  cancelServiceJobSchema, changeServiceStatusSchema, createServiceJobSchema,
  customerServiceJobsParamsSchema, reopenServiceJobSchema, serviceAuditQuerySchema,
  serviceJobListQuerySchema, serviceJobParamsSchema, updateServiceJobSchema,
} from './service-jobs.validator';

export const serviceJobsRoutes = Router();
export const customerServiceJobsRoutes = Router();

serviceJobsRoutes.get('/summary', ServiceJobsController.summary);
serviceJobsRoutes.get('/', validate(serviceJobListQuerySchema, 'query'), ServiceJobsController.list);
serviceJobsRoutes.post('/', validate(createServiceJobSchema), ServiceJobsController.create);
serviceJobsRoutes.get('/:serviceJobId/audit', requireServiceAdmin, validate(serviceJobParamsSchema, 'params'), validate(serviceAuditQuerySchema, 'query'), ServiceJobsController.audit);
serviceJobsRoutes.post('/:serviceJobId/status', validate(serviceJobParamsSchema, 'params'), validate(changeServiceStatusSchema), ServiceJobsController.status);
serviceJobsRoutes.post('/:serviceJobId/cancel', requireServiceAdmin, validate(serviceJobParamsSchema, 'params'), validate(cancelServiceJobSchema), ServiceJobsController.cancel);
serviceJobsRoutes.post('/:serviceJobId/reopen', requireServiceAdmin, validate(serviceJobParamsSchema, 'params'), validate(reopenServiceJobSchema), ServiceJobsController.reopen);
serviceJobsRoutes.patch('/:serviceJobId', validate(serviceJobParamsSchema, 'params'), validate(updateServiceJobSchema), ServiceJobsController.update);
serviceJobsRoutes.get('/:serviceJobId', validate(serviceJobParamsSchema, 'params'), ServiceJobsController.get);

customerServiceJobsRoutes.get('/:customerId/service-jobs', validate(customerServiceJobsParamsSchema, 'params'), validate(serviceJobListQuerySchema, 'query'), ServiceJobsController.listCustomer);
