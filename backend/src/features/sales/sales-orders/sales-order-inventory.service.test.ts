import {
  Prisma,
  Role,
  SalesAuditAction,
  SalesOrderFulfillmentStatus,
  SalesOrderStockFulfillmentStatus,
  StockMovementType,
} from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { inventory, repository, audit, runTransaction, tx } = vi.hoisted(() => ({
  tx: { marker: 'transaction' },
  inventory: {
    findProduct: vi.fn(), findOpeningBalance: vi.fn(), compareAndSetQuantity: vi.fn(), createMovement: vi.fn(),
  },
  repository: {
    findOrder: vi.fn(), findActiveFulfillmentForItem: vi.fn(), findFulfillments: vi.fn(),
    createFulfillment: vi.fn(), reverseFulfillment: vi.fn(), findActor: vi.fn(),
  },
  audit: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('../../financial/infrastructure/transaction', () => ({
  runFinancialTransaction: runTransaction,
}));
vi.mock('../../inventory/inventory.repository', () => ({ InventoryRepository: inventory }));
vi.mock('../audit/sales-audit', () => ({ writeSalesAudit: audit }));
vi.mock('./sales-order-inventory.repository', () => ({ SalesOrderInventoryRepository: repository }));

import { SalesOrderInventoryService } from './sales-order-inventory.service';

const orderId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const secondProductId = '22222222-2222-4222-8222-222222222223';
const itemId = '33333333-3333-4333-8333-333333333333';
const secondItemId = '33333333-3333-4333-8333-333333333334';
const fulfillmentId = '44444444-4444-4444-8444-444444444444';
const user = { userId: '55555555-5555-4555-8555-555555555555', role: Role.EMPLOYEE };
const admin = { ...user, role: Role.ADMIN };
const openingCreatedAt = new Date('2026-08-12T22:30:00.000Z'); // 2026-08-13 in Beirut

const order = {
  id: orderId,
  orderNumber: 'SO-2026-0001',
  orderDate: new Date('2026-08-13T00:00:00.000Z'),
  fulfillmentStatus: SalesOrderFulfillmentStatus.CONFIRMED,
  items: [{ id: itemId, productId, quantity: 2 }],
};

describe('sales order inventory service', () => {
  let balances: Map<string, number>;
  let movementSequence: number;

  beforeEach(() => {
    vi.clearAllMocks();
    balances = new Map([[productId, 10], [secondProductId, 10]]);
    movementSequence = 0;
    runTransaction.mockImplementation((operation: (client: unknown) => unknown) => operation(tx));
    repository.findOrder.mockResolvedValue(order);
    repository.findActiveFulfillmentForItem.mockResolvedValue(null);
    repository.findFulfillments.mockResolvedValue([]);
    repository.findActor.mockResolvedValue({ fullName: 'User', username: 'user' });
    repository.createFulfillment.mockImplementation((data) => Promise.resolve({ id: `fulfillment-${data.salesOrderItemId}`, ...data }));
    repository.reverseFulfillment.mockResolvedValue({ count: 1 });
    inventory.findProduct.mockImplementation((id: string) => Promise.resolve({
      id, trackStock: true, stockQuantity: balances.get(id) ?? 0,
    }));
    inventory.findOpeningBalance.mockResolvedValue({ id: 'opening', createdAt: openingCreatedAt });
    inventory.compareAndSetQuantity.mockImplementation((id: string, before: number, after: number) => {
      if (balances.get(id) !== before) return Promise.resolve({ count: 0 });
      balances.set(id, after);
      return Promise.resolve({ count: 1 });
    });
    inventory.createMovement.mockImplementation((data) => Promise.resolve({ id: `movement-${++movementSequence}`, ...data }));
    audit.mockResolvedValue({ id: 'audit' });
  });

  it('keeps customer, financial, and supplier-ledger writes outside this boundary', () => {
    const source = [
      'sales-order-inventory.service.ts',
      'sales-order-inventory.repository.ts',
    ].map((file) => fs.readFileSync(path.resolve(__dirname, file), 'utf8')).join('\n');
    expect(source).not.toMatch(
      /\b(?:customer|debt|payment|paymentAllocation|installmentPlan|installment|transaction|supplierTransaction)\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\b/
    );
  });

  it.each([Role.ADMIN, Role.EMPLOYEE])('%s deducts without a password using the stored line authority', async (role) => {
    const result = await SalesOrderInventoryService.deductStock(orderId, {
      itemIds: [itemId],
      note: 'Counter sale',
    }, { ...user, role }, {});

    expect(balances.get(productId)).toBe(8);
    expect(inventory.createMovement).toHaveBeenCalledWith(expect.objectContaining({
      productId,
      movementType: StockMovementType.SALE_FULFILLMENT,
      quantityChange: -2,
      quantityBefore: 10,
      quantityAfter: 8,
      referenceType: 'SALES_ORDER_ITEM',
      referenceId: itemId,
      createdById: user.userId,
    }), tx);
    expect(repository.createFulfillment).toHaveBeenCalledWith(expect.objectContaining({
      salesOrderId: orderId,
      salesOrderItemId: itemId,
      productId,
      quantity: 2,
      status: SalesOrderStockFulfillmentStatus.ACTIVE,
    }), tx);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: SalesAuditAction.DEDUCT_STOCK }), tx);
    expect(result.fulfillments[0]).toMatchObject({ itemId, productId, quantity: 2 });
  });

  it('chains repeated-product balances and rejects their aggregate before any write', async () => {
    repository.findOrder.mockResolvedValueOnce({
      ...order,
      items: [
        { id: itemId, productId, quantity: 6 },
        { id: secondItemId, productId, quantity: 6 },
      ],
    });
    await expect(SalesOrderInventoryService.deductStock(orderId, { itemIds: [secondItemId, itemId] }, user, {}))
      .rejects.toThrow('Cannot deduct 6; only 4 units');
    expect(inventory.compareAndSetQuantity).not.toHaveBeenCalled();
    expect(inventory.createMovement).not.toHaveBeenCalled();
    expect(repository.createFulfillment).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(balances.get(productId)).toBe(10);
  });

  it('chains two eligible repeated-product lines 10 to 8 to 6', async () => {
    repository.findOrder.mockResolvedValueOnce({
      ...order,
      items: [
        { id: secondItemId, productId, quantity: 2 },
        { id: itemId, productId, quantity: 2 },
      ],
    });
    await SalesOrderInventoryService.deductStock(orderId, { itemIds: [secondItemId, itemId] }, user, {});
    expect(inventory.createMovement.mock.calls.map(([data]) => [data.quantityBefore, data.quantityAfter])).toEqual([[10, 8], [8, 6]]);
    expect(balances.get(productId)).toBe(6);
  });

  it('rejects a manual line, disabled tracking, missing opening count, insufficient stock, and active fulfillment', async () => {
    repository.findOrder.mockResolvedValueOnce({ ...order, items: [{ id: itemId, productId: null, quantity: 2 }] });
    await expect(SalesOrderInventoryService.deductStock(orderId, { itemIds: [itemId] }, user, {})).rejects.toThrow('Manual order lines');

    inventory.findProduct.mockResolvedValueOnce({ id: productId, trackStock: false, stockQuantity: 10 });
    await expect(SalesOrderInventoryService.deductStock(orderId, { itemIds: [itemId] }, user, {})).rejects.toThrow('Stock tracking is disabled');

    inventory.findOpeningBalance.mockResolvedValueOnce(null);
    await expect(SalesOrderInventoryService.deductStock(orderId, { itemIds: [itemId] }, user, {})).rejects.toThrow('verified opening count');

    balances.set(productId, 1);
    await expect(SalesOrderInventoryService.deductStock(orderId, { itemIds: [itemId] }, user, {})).rejects.toThrow('only 1 units');

    balances.set(productId, 10);
    repository.findActiveFulfillmentForItem.mockResolvedValueOnce({ id: fulfillmentId });
    await expect(SalesOrderInventoryService.deductStock(orderId, { itemIds: [itemId] }, user, {})).rejects.toMatchObject({ statusCode: 409 });
    expect(inventory.createMovement).not.toHaveBeenCalled();
  });

  it.each([
    SalesOrderFulfillmentStatus.DRAFT,
    SalesOrderFulfillmentStatus.CANCELLED,
    SalesOrderFulfillmentStatus.RETURNED,
  ])('rejects an ineligible %s order', async (status) => {
    repository.findOrder.mockResolvedValueOnce({ ...order, fulfillmentStatus: status });
    await expect(SalesOrderInventoryService.deductStock(orderId, { itemIds: [itemId] }, user, {}))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('allows a delivered order and uses Beirut date at the opening-count midnight boundary', async () => {
    repository.findOrder.mockResolvedValueOnce({ ...order, fulfillmentStatus: SalesOrderFulfillmentStatus.DELIVERED });
    await SalesOrderInventoryService.deductStock(orderId, { itemIds: [itemId] }, user, {});
    expect(balances.get(productId)).toBe(8);

    balances.set(productId, 10);
    repository.findOrder.mockResolvedValueOnce({ ...order, orderDate: new Date('2026-08-12T00:00:00.000Z') });
    await expect(SalesOrderInventoryService.deductStock(orderId, { itemIds: [itemId] }, user, {}))
      .rejects.toThrow('predates the verified opening count');
  });

  it('rejects an item from another order before writing', async () => {
    await expect(SalesOrderInventoryService.deductStock(orderId, { itemIds: [secondItemId] }, user, {}))
      .rejects.toThrow('Sales order item not found');
    expect(inventory.compareAndSetQuantity).not.toHaveBeenCalled();
  });

  it('maps only the measured fulfillment P2002 shape to a 409 conflict', async () => {
    repository.createFulfillment.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { modelName: 'SalesOrderStockFulfillment', target: ['salesOrderItemId'] },
    }));
    await expect(SalesOrderInventoryService.deductStock(orderId, { itemIds: [itemId] }, user, {}))
      .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });

    const unrelated = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test', meta: { modelName: 'Product', target: ['sku'] },
    });
    repository.createFulfillment.mockRejectedValueOnce(unrelated);
    balances.set(productId, 10);
    await expect(SalesOrderInventoryService.deductStock(orderId, { itemIds: [itemId] }, user, {})).rejects.toBe(unrelated);
  });

  it('restores an active fulfillment for an admin without a password and records the typed reason', async () => {
    repository.findFulfillments.mockResolvedValueOnce([{
      id: fulfillmentId,
      salesOrderId: orderId,
      salesOrderItemId: itemId,
      productId,
      quantity: 2,
      status: SalesOrderStockFulfillmentStatus.ACTIVE,
      stockMovementId: 'movement-original',
      reversalStockMovementId: null,
    }]);
    balances.set(productId, 8);

    const result = await SalesOrderInventoryService.restoreStock(orderId, {
      fulfillmentIds: [fulfillmentId], reason: 'Customer cancelled', note: 'Unopened box',
    }, admin, {});

    expect(balances.get(productId)).toBe(10);
    expect(inventory.createMovement).toHaveBeenCalledWith(expect.objectContaining({
      movementType: StockMovementType.SALE_CANCEL_RESTORE,
      quantityChange: 2,
      quantityBefore: 8,
      quantityAfter: 10,
      reason: 'Customer cancelled',
      referenceId: itemId,
    }), tx);
    expect(repository.reverseFulfillment).toHaveBeenCalledWith(fulfillmentId, expect.objectContaining({
      reversedById: admin.userId,
      reversalReason: 'Customer cancelled',
    }), tx);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: SalesAuditAction.RESTORE_STOCK }), tx);
    expect(result.fulfillments[0]).toMatchObject({ fulfillmentId, originalMovementId: 'movement-original' });
  });

  it('allows the restored line to be deducted again', async () => {
    repository.findFulfillments.mockResolvedValueOnce([{
      id: fulfillmentId,
      salesOrderId: orderId,
      salesOrderItemId: itemId,
      productId,
      quantity: 2,
      status: SalesOrderStockFulfillmentStatus.ACTIVE,
      stockMovementId: 'movement-original',
      reversalStockMovementId: null,
    }]);
    balances.set(productId, 8);
    await SalesOrderInventoryService.restoreStock(orderId, {
      fulfillmentIds: [fulfillmentId], reason: 'Correct mistaken deduction',
    }, admin, {});
    expect(balances.get(productId)).toBe(10);

    repository.findActiveFulfillmentForItem.mockResolvedValue(null);
    await SalesOrderInventoryService.deductStock(orderId, { itemIds: [itemId] }, user, {});
    expect(balances.get(productId)).toBe(8);
    expect(repository.createFulfillment).toHaveBeenCalledTimes(1);
  });

  it('rejects employee, blank-reason, foreign, and already-reversed restorations without stock writes', async () => {
    await expect(SalesOrderInventoryService.restoreStock(orderId, { fulfillmentIds: [fulfillmentId], reason: 'Customer cancelled' }, user, {}))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(SalesOrderInventoryService.restoreStock(orderId, { fulfillmentIds: [fulfillmentId], reason: '   ' }, admin, {}))
      .rejects.toThrow('Reason is required');

    repository.findFulfillments.mockResolvedValueOnce([]);
    await expect(SalesOrderInventoryService.restoreStock(orderId, { fulfillmentIds: [fulfillmentId], reason: 'Customer cancelled' }, admin, {}))
      .rejects.toThrow('fulfillment not found');

    repository.findFulfillments.mockResolvedValueOnce([{
      id: fulfillmentId, salesOrderId: orderId, salesOrderItemId: itemId, productId, quantity: 2,
      status: SalesOrderStockFulfillmentStatus.REVERSED, stockMovementId: 'movement-original', reversalStockMovementId: 'movement-reversal',
    }]);
    await expect(SalesOrderInventoryService.restoreStock(orderId, { fulfillmentIds: [fulfillmentId], reason: 'Customer cancelled' }, admin, {}))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(inventory.createMovement).not.toHaveBeenCalled();
  });
});
