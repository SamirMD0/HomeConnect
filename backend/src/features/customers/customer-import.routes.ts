import { Router } from 'express';
import { customerImportBranchGuard } from './customer-import-branch.middleware';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { CustomerImportService } from './customer-import.service';
import {
  createCustomerImportSchema,
  customerImportParamsSchema,
  updateCustomerImportSchema,
  commitCustomerImportSchema,
} from './customer-import.validator';

export const customerImportRoutes = Router();
customerImportRoutes.use(requireAuth, customerImportBranchGuard);
// The service enforces ADMIN using the current database role and rechecks the
// immutable destination against accessibleBranches inside every transaction.
// Mount ahead of customer parent guards: an import chooses its own destination.
const handle =
  (action: (req: Request) => Promise<unknown>, status = 200) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(status).json({ success: true, data: await action(req) });
    } catch (error) {
      next(error);
    }
  };
customerImportRoutes.post(
  '/',
  validate(createCustomerImportSchema),
  handle((req) => CustomerImportService.createDraft(req.body, req.user!), 201)
);
customerImportRoutes.get(
  '/:importId',
  validate(customerImportParamsSchema, 'params'),
  handle((req) => CustomerImportService.getDraft(String(req.params.importId), req.user!))
);
customerImportRoutes.patch(
  '/:importId',
  validate(customerImportParamsSchema, 'params'),
  validate(updateCustomerImportSchema),
  handle((req) =>
    CustomerImportService.updateDraft(String(req.params.importId), req.body, req.user!)
  )
);
customerImportRoutes.post(
  '/:importId/commit',
  validate(customerImportParamsSchema, 'params'),
  validate(commitCustomerImportSchema),
  handle((req) =>
    CustomerImportService.commit(String(req.params.importId), req.body, req.user!, {
      ipAddress: req.ip ?? null,
      requestId:
        typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null,
    })
  )
);
