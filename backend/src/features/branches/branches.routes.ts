import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireRole } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { BranchesController } from './branches.controller';
import {
  branchParamsSchema,
  createBranchSchema,
  setUserBranchAccessSchema,
  updateBranchSchema,
  userBranchParamsSchema,
} from './branches.validator';

const requireAdmin = requireRole([Role.ADMIN]);

export const branchesRoutes = Router();

// Any signed-in user: the branches they may work in (drives the branch selector).
branchesRoutes.get('/accessible', BranchesController.accessible);

branchesRoutes.get('/', requireAdmin, BranchesController.list);
branchesRoutes.post('/', requireAdmin, validate(createBranchSchema), BranchesController.create);
branchesRoutes.get('/access', requireAdmin, BranchesController.listStaffAccess);
branchesRoutes.get(
  '/users/:userId/access',
  requireAdmin,
  validate(userBranchParamsSchema, 'params'),
  BranchesController.getUserAccess
);
branchesRoutes.put(
  '/users/:userId/access',
  requireAdmin,
  validate(userBranchParamsSchema, 'params'),
  validate(setUserBranchAccessSchema),
  BranchesController.setUserAccess
);
branchesRoutes.get('/:branchId', requireAdmin, validate(branchParamsSchema, 'params'), BranchesController.get);
branchesRoutes.patch(
  '/:branchId',
  requireAdmin,
  validate(branchParamsSchema, 'params'),
  validate(updateBranchSchema),
  BranchesController.update
);
