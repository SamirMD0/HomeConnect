import { NextFunction, Request, Response } from 'express';
import { StockMovementType } from '@prisma/client';
import { InventoryService } from './inventory.service';
import {
  InventoryMovementListQuery,
  InventoryProductParamsInput,
  LowStockListQuery,
  StockMovementInput,
  VerifyOpeningCountInput,
} from './inventory.validator';

const contextFrom = (req: Request) => ({
  requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : null,
  ipAddress: req.ip ?? null,
});

export class InventoryController {
  static async summary(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await InventoryService.getInventorySummary() }); }
    catch (error) { next(error); }
  }

  static async lowStock(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await InventoryService.getLowStockProducts(req.query as unknown as LowStockListQuery);
      res.json({ success: true, data: result.items, meta: pagination(result) });
    } catch (error) { next(error); }
  }

  static async movements(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await InventoryService.getProductMovements(req.query as unknown as InventoryMovementListQuery);
      res.json({ success: true, data: result.items, meta: pagination(result) });
    } catch (error) { next(error); }
  }

  static async productInventory(req: Request<InventoryProductParamsInput>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await InventoryService.getProductInventory(req.params.productId) }); }
    catch (error) { next(error); }
  }

  static async createMovement(
    req: Request<InventoryProductParamsInput, unknown, StockMovementInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { productId } = req.params;
      const input = req.body;
      const common = {
        quantity: input.quantity,
        expectedBefore: input.expectedBefore,
        reason: input.reason,
        note: input.note,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      };
      const result = input.movementType === StockMovementType.MANUAL_ADD
        ? await InventoryService.addStock(productId, common, req.user!, contextFrom(req))
        : input.movementType === StockMovementType.MANUAL_REMOVE
          ? await InventoryService.removeStock(productId, { ...common, accountPassword: input.accountPassword! }, req.user!, contextFrom(req))
          : input.movementType === StockMovementType.STOCK_COUNT
            ? await InventoryService.correctStockCount(productId, { ...common, targetTotal: input.quantity, accountPassword: input.accountPassword! }, req.user!, contextFrom(req))
            : input.movementType === StockMovementType.DAMAGE_LOSS
              ? await InventoryService.markDamagedLost(productId, { ...common, accountPassword: input.accountPassword! }, req.user!, contextFrom(req))
              : await InventoryService.returnToStock(productId, common, req.user!, contextFrom(req));
      res.status(result.changed ? 201 : 200).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async verifyOpeningCount(
    req: Request<InventoryProductParamsInput, unknown, VerifyOpeningCountInput>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const result = await InventoryService.verifyOpeningCount(req.params.productId, req.body, req.user!, contextFrom(req));
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }
}

const pagination = (result: { page: number; pageSize: number; total: number }) => ({
  pagination: {
    page: result.page,
    pageSize: result.pageSize,
    totalItems: result.total,
    totalPages: Math.ceil(result.total / result.pageSize),
  },
});
