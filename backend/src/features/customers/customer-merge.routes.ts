import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { customerMergeSchema } from '../../validators/customers.validator';
import { CustomerMergeService } from './customer-merge.service';

/** A merge spans branches, so it does not bind to the header's one branch. The
 * service re-reads the actor's branch access inside its transaction. */
export const customerMergeRoutes = Router();
customerMergeRoutes.use(requireRole(['ADMIN']));

customerMergeRoutes.get(
  '/:customerId/candidates',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await CustomerMergeService.candidates(req.params.customerId as string, req.user!);
      res.status(200).json({ success: true, data, meta: { timestamp: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  }
);
customerMergeRoutes.post(
  '/:customerId',
  validate(customerMergeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await CustomerMergeService.merge(
        req.params.customerId as string,
        req.body,
        req.user!,
        req.ip ?? null
      );
      res.status(200).json({ success: true, data, meta: { timestamp: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  }
);
