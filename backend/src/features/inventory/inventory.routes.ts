import { Router } from 'express';
import { supplierReceivingsRoutes } from './receiving/supplier-receivings.routes';
import { validate } from '../../middleware/validate.middleware';
import { InventoryController } from './inventory.controller';
import { inventoryMovementListSchema, lowStockListSchema } from './inventory.validator';

export const inventoryRoutes = Router();
inventoryRoutes.use('/receivings', supplierReceivingsRoutes);

inventoryRoutes.get('/summary', InventoryController.summary);
inventoryRoutes.get('/low-stock', validate(lowStockListSchema, 'query'), InventoryController.lowStock);
inventoryRoutes.get('/movements', validate(inventoryMovementListSchema, 'query'), InventoryController.movements);
