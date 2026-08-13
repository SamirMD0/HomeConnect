import {
  Prisma,
  Role,
  SalesAuditAction,
  SalesAuditRecordType,
  SalesOrderFulfillmentStatus,
  SalesOrderStockFulfillmentStatus,
  StockMovementType,
} from '@prisma/client';
import { AuthorizationError, NotFoundError, ValidationError } from '../../../lib/errors';
import {
  compareBusinessDates,
  getBusinessTimezone,
  prismaDateToBusinessDate,
  timestampToBusinessDate,
} from '../../financial/domain/business-date';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { InventoryRepository } from '../../inventory/inventory.repository';
import { normalizeOptionalText, normalizeRequiredReason } from '../../inventory/inventory.validator';
import { writeSalesAudit } from '../audit/sales-audit';
import { SalesConflictError } from '../domain/sales-errors';
import type { SalesMutationUser, SalesRequestContext } from '../domain/sales-types';
import { SalesOrderInventoryRepository } from './sales-order-inventory.repository';
import type { DeductSalesOrderStockInput, RestoreSalesOrderStockInput } from './sales-orders.validator';

const MAX_STOCK_QUANTITY = 2_147_483_647;
const ONBOARDING_REQUIRED =
  'This product needs a verified opening count before stock actions / يحتاج هذا المنتج جردًا مؤكدًا قبل حركات المخزون';
const STOCK_NOT_TRACKED =
  'Stock tracking is disabled for this product / تتبع المخزون غير مفعّل لهذا المنتج';
const MANUAL_LINE =
  'Manual order lines cannot affect inventory / لا يمكن لأسطر الطلب اليدوية التأثير على المخزون';
const ORDER_NOT_ELIGIBLE =
  'This order is not eligible for stock deduction / هذا الطلب غير مؤهل لإخراج المخزون';
const ALREADY_DEDUCTED =
  'Stock has already been deducted for this line / تم إخراج المخزون لهذا السطر';
const ALREADY_RESTORED =
  'Stock has already been restored for this fulfillment / تمت إعادة المخزون لهذا السجل بالفعل';
const PREDATES_OPENING_COUNT =
  'This order predates the verified opening count for this product; its stock effect is already included in the counted quantity. / هذا الطلب يسبق الجرد الافتتاحي المؤكد لهذا المنتج، وتأثيره على المخزون محتسب مسبقًا.';

const DEDUCTIBLE_STATUSES = new Set<SalesOrderFulfillmentStatus>([
  SalesOrderFulfillmentStatus.CONFIRMED,
  SalesOrderFulfillmentStatus.PREPARING,
  SalesOrderFulfillmentStatus.READY_FOR_DELIVERY,
  SalesOrderFulfillmentStatus.OUT_FOR_DELIVERY,
  SalesOrderFulfillmentStatus.DELIVERED,
]);

export class SalesOrderInventoryService {
  static async deductStock(
    orderId: string,
    input: DeductSalesOrderStockInput,
    user: SalesMutationUser,
    context: SalesRequestContext = {}
  ) {
    assertDeductionRole(user);
    try {
      return await runFinancialTransaction(async (tx) => {
        const order = await SalesOrderInventoryRepository.findOrder(orderId, tx);
        if (!order) throw new NotFoundError('Sales order not found');
        if (!DEDUCTIBLE_STATUSES.has(order.fulfillmentStatus)) throw new SalesConflictError(ORDER_NOT_ELIGIBLE);

        const itemById = new Map(order.items.map((item) => [item.id, item]));
        const items = input.itemIds.map((itemId) => {
          const item = itemById.get(itemId);
          if (!item) throw new NotFoundError('Sales order item not found');
          return item;
        }).sort((left, right) =>
          (left.productId ?? '').localeCompare(right.productId ?? '') || left.id.localeCompare(right.id)
        );

        // Validate the complete request before the first write. The running balance is
        // deliberately tracked per product so repeated lines cannot each reuse one stale total.
        const runningBalances = new Map<string, number>();
        for (const item of items) {
          if (!item.productId) throw new ValidationError(MANUAL_LINE);
          const product = await InventoryRepository.findProduct(item.productId, tx);
          if (!product) throw new NotFoundError('Product not found');
          if (!product.trackStock) throw new ValidationError(STOCK_NOT_TRACKED);
          const opening = await InventoryRepository.findOpeningBalance(item.productId, tx);
          if (!opening) throw new ValidationError(ONBOARDING_REQUIRED);
          if (compareBusinessDates(
            prismaDateToBusinessDate(order.orderDate),
            timestampToBusinessDate(getBusinessTimezone(), opening.createdAt)
          ) < 0) {
            throw new SalesConflictError(PREDATES_OPENING_COUNT);
          }
          if (await SalesOrderInventoryRepository.findActiveFulfillmentForItem(item.id, tx)) {
            throw new SalesConflictError(ALREADY_DEDUCTED);
          }
          const available = runningBalances.get(item.productId) ?? product.stockQuantity;
          if (available < item.quantity) throw insufficientStock(item.quantity, available);
          runningBalances.set(item.productId, available - item.quantity);
        }

        const reason = normalizeRequiredReason(deductionReason(order.orderNumber));
        const note = normalizeOptionalText(input.note);
        const results: Array<{
          itemId: string;
          productId: string;
          quantity: number;
          quantityBefore: number;
          quantityAfter: number;
          movementId: string;
          fulfillmentId: string;
        }> = [];

        for (const item of items) {
          const productId = item.productId!;
          const product = await InventoryRepository.findProduct(productId, tx);
          if (!product) throw new NotFoundError('Product not found');
          const before = product.stockQuantity;
          const after = before - item.quantity;
          if (after < 0) throw insufficientStock(item.quantity, before);
          const updated = await InventoryRepository.compareAndSetQuantity(productId, before, after, tx);
          if (updated.count !== 1) throw staleStock(before);
          const movement = await InventoryRepository.createMovement({
            productId,
            movementType: StockMovementType.SALE_FULFILLMENT,
            quantityChange: -item.quantity,
            quantityBefore: before,
            quantityAfter: after,
            reason,
            note,
            referenceType: 'SALES_ORDER_ITEM',
            referenceId: item.id,
            createdById: user.userId,
          }, tx);
          const fulfillment = await SalesOrderInventoryRepository.createFulfillment({
            salesOrderId: order.id,
            salesOrderItemId: item.id,
            productId,
            quantity: item.quantity,
            status: SalesOrderStockFulfillmentStatus.ACTIVE,
            stockMovementId: movement.id,
            createdById: user.userId,
          }, tx);
          results.push({
            itemId: item.id,
            productId,
            quantity: item.quantity,
            quantityBefore: before,
            quantityAfter: after,
            movementId: movement.id,
            fulfillmentId: fulfillment.id,
          });
        }

        await audit(order.id, SalesAuditAction.DEDUCT_STOCK, reason, results, user, context, tx);
        return {
          message: `Stock deducted for sales order ${order.orderNumber} / تم إخراج المخزون لطلب البيع ${order.orderNumber}`,
          fulfillments: results,
        };
      });
    } catch (error) {
      if (isActiveFulfillmentCollision(error)) throw new SalesConflictError(ALREADY_DEDUCTED);
      throw error;
    }
  }

  static async restoreStock(
    orderId: string,
    input: RestoreSalesOrderStockInput,
    user: SalesMutationUser,
    context: SalesRequestContext = {}
  ) {
    assertRestorationRole(user);
    const reason = normalizeRequiredReason(input.reason);
    const note = normalizeOptionalText(input.note);
    return runFinancialTransaction(async (tx) => {
      const order = await SalesOrderInventoryRepository.findOrder(orderId, tx);
      if (!order) throw new NotFoundError('Sales order not found');
      const found = await SalesOrderInventoryRepository.findFulfillments(input.fulfillmentIds, tx);
      const byId = new Map(found.map((fulfillment) => [fulfillment.id, fulfillment]));
      const fulfillments = input.fulfillmentIds.map((id) => {
        const fulfillment = byId.get(id);
        if (!fulfillment || fulfillment.salesOrderId !== order.id) {
          throw new NotFoundError('Sales order stock fulfillment not found');
        }
        if (fulfillment.status !== SalesOrderStockFulfillmentStatus.ACTIVE) {
          throw new SalesConflictError(ALREADY_RESTORED);
        }
        return fulfillment;
      }).sort((left, right) => left.productId.localeCompare(right.productId) || left.id.localeCompare(right.id));

      const runningBalances = new Map<string, number>();
      for (const fulfillment of fulfillments) {
        const product = await InventoryRepository.findProduct(fulfillment.productId, tx);
        if (!product) throw new NotFoundError('Product not found');
        const before = runningBalances.get(fulfillment.productId) ?? product.stockQuantity;
        const after = before + fulfillment.quantity;
        assertStockCeiling(after);
        runningBalances.set(fulfillment.productId, after);
      }

      const results: Array<{
        fulfillmentId: string;
        itemId: string;
        productId: string;
        quantity: number;
        quantityBefore: number;
        quantityAfter: number;
        originalMovementId: string;
        reversalMovementId: string;
      }> = [];
      for (const fulfillment of fulfillments) {
        const product = await InventoryRepository.findProduct(fulfillment.productId, tx);
        if (!product) throw new NotFoundError('Product not found');
        const before = product.stockQuantity;
        const after = before + fulfillment.quantity;
        assertStockCeiling(after);
        const updated = await InventoryRepository.compareAndSetQuantity(fulfillment.productId, before, after, tx);
        if (updated.count !== 1) throw staleStock(before);
        const movement = await InventoryRepository.createMovement({
          productId: fulfillment.productId,
          movementType: StockMovementType.SALE_CANCEL_RESTORE,
          quantityChange: fulfillment.quantity,
          quantityBefore: before,
          quantityAfter: after,
          reason,
          note,
          referenceType: 'SALES_ORDER_ITEM',
          referenceId: fulfillment.salesOrderItemId,
          createdById: user.userId,
        }, tx);
        const reversed = await SalesOrderInventoryRepository.reverseFulfillment(fulfillment.id, {
          reversalStockMovementId: movement.id,
          reversedAt: new Date(),
          reversedById: user.userId,
          reversalReason: reason,
        }, tx);
        if (reversed.count !== 1) throw new SalesConflictError(ALREADY_RESTORED);
        results.push({
          fulfillmentId: fulfillment.id,
          itemId: fulfillment.salesOrderItemId,
          productId: fulfillment.productId,
          quantity: fulfillment.quantity,
          quantityBefore: before,
          quantityAfter: after,
          originalMovementId: fulfillment.stockMovementId,
          reversalMovementId: movement.id,
        });
      }

      await audit(
        order.id,
        SalesAuditAction.RESTORE_STOCK,
        `Stock restored for sales order ${order.orderNumber}: ${reason}`,
        results,
        user,
        context,
        tx
      );
      return {
        message: `Stock restored for sales order ${order.orderNumber} / تمت إعادة المخزون لطلب البيع ${order.orderNumber}`,
        fulfillments: results,
      };
    });
  }
}

function assertDeductionRole(user: SalesMutationUser): void {
  if (!user?.userId) throw new AuthorizationError('User not authenticated');
  if (user.role !== Role.ADMIN && user.role !== Role.EMPLOYEE) {
    throw new AuthorizationError('You do not have permission to deduct sales-order stock');
  }
}

function assertRestorationRole(user: SalesMutationUser): void {
  if (!user?.userId) throw new AuthorizationError('User not authenticated');
  if (user.role !== Role.ADMIN) throw new AuthorizationError('Only administrators can restore sales-order stock');
}

function insufficientStock(quantity: number, available: number): ValidationError {
  return new ValidationError(
    `Cannot deduct ${quantity}; only ${available} units are in stock / لا يمكن إخراج ${quantity}؛ المتوفر ${available} فقط`
  );
}

function staleStock(expected: number): ValidationError {
  return new ValidationError(
    `Stock changed from expected ${expected} to a different value. Refresh and retry / تغيّر المخزون، يرجى التحديث والمحاولة مجددًا`
  );
}

function assertStockCeiling(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity > MAX_STOCK_QUANTITY) {
    throw new ValidationError('Resulting stock quantity is too large');
  }
}

function deductionReason(orderNumber: string): string {
  return `Stock deducted for sales order ${orderNumber} / إخراج مخزون للطلب ${orderNumber}`;
}

async function audit(
  orderId: string,
  action: SalesAuditAction,
  reason: string,
  lines: unknown[],
  user: SalesMutationUser,
  context: SalesRequestContext,
  tx: Prisma.TransactionClient
) {
  const actor = await SalesOrderInventoryRepository.findActor(user.userId, tx);
  if (!actor) throw new NotFoundError('User not found');
  await writeSalesAudit({
    recordType: SalesAuditRecordType.SALES_ORDER,
    recordId: orderId,
    salesOrderId: orderId,
    action,
    changedById: user.userId,
    changedByName: actor.fullName,
    changedByUsername: actor.username,
    reason,
    beforeValues: { stockFulfillments: [] },
    afterValues: { stockFulfillments: lines } as Prisma.InputJsonObject,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
  }, tx);
}

function isActiveFulfillmentCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  return error.meta?.modelName === 'SalesOrderStockFulfillment'
    && Array.isArray(target)
    && target.includes('salesOrderItemId');
}
