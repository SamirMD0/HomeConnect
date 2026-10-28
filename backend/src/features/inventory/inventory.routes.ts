import { branchScopeMiddleware } from '../../middleware/branch-scope.middleware';
import { recordScopeGuard } from '../../middleware/branch-parent.middleware';
import { Router } from 'express';
import { supplierReceivingsRoutes } from './receiving/supplier-receivings.routes';
import { validate } from '../../middleware/validate.middleware';
import { InventoryController } from './inventory.controller';
import {
  batchVerifyOpeningCountSchema,
  inventoryMovementListSchema,
  lowStockListSchema,
  onboardingWorklistSchema,
} from './inventory.validator';
import { requireServiceAdmin } from '../service/authorization/service-policy';

export const inventoryRoutes = Router();
inventoryRoutes.use('/receivings', branchScopeMiddleware, recordScopeGuard('receiving'), supplierReceivingsRoutes);

inventoryRoutes.get('/onboarding/pending', validate(onboardingWorklistSchema, 'query'), InventoryController.pendingOnboarding);
inventoryRoutes.post('/onboarding/batch', requireServiceAdmin, validate(batchVerifyOpeningCountSchema), InventoryController.batchVerifyOpeningCount);
inventoryRoutes.get('/summary', InventoryController.summary);
inventoryRoutes.get('/low-stock', validate(lowStockListSchema, 'query'), InventoryController.lowStock);
inventoryRoutes.get('/movements', validate(inventoryMovementListSchema, 'query'), InventoryController.movements);
