import {
  Currency,
  DebtStatus,
  InstallmentPlanStatus,
  InstallmentStatus,
  Prisma,
  SalesAuditAction,
  SalesAuditRecordType,
  SalesOrderFulfillmentStatus,
  SalesReturnRefundMethod,
  SalesReturnStockDisposition,
  SalesOrderStockFulfillmentStatus,
  StockMovementType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import {
  businessDateToPrisma,
  compareBusinessDates,
  prismaDateToBusinessDate,
  todayInBusinessTimezone,
} from '../../financial/domain/business-date';
import {
  compareMoney,
  minMoney,
  moneyToApiString,
  parseMoney,
  subtractMoney,
  sumMoney,
  toBaseAmount,
  ZERO_MONEY,
} from '../../financial/domain/money';
import { determineDebtStatus, determineInstallmentPlanStatus, determineInstallmentStatus } from '../../financial/domain/statuses';
import {
  assertIdempotentReplay,
  createIdempotencyFingerprint,
  normalizeIdempotencyKey,
} from '../../financial/infrastructure/idempotency';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { InventoryRepository } from '../../inventory/inventory.repository';
import { assertSalesAdmin } from '../authorization/sales-policy';
import { writeSalesAudit } from '../audit/sales-audit';
import { SalesConflictError } from '../domain/sales-errors';
import type { SalesMutationUser, SalesRequestContext } from '../domain/sales-types';
import type { ReturnSalesOrderInput } from '../sales-orders/sales-orders.validator';
import { allocateReturnLine, deriveReturnSettlement } from './sales-return-calculation';
import { SalesReturnRecord, SalesReturnsRepository } from './sales-returns.repository';

const MAX_STOCK_QUANTITY = 2_147_483_647;
const RETURNABLE_STATUSES = new Set<SalesOrderFulfillmentStatus>([
  SalesOrderFulfillmentStatus.DELIVERED,
  SalesOrderFulfillmentStatus.PARTIALLY_RETURNED,
]);

type LoadedOrder = NonNullable<Awaited<ReturnType<typeof SalesReturnsRepository.loadOrder>>>;
type LoadedItem = LoadedOrder['items'][number];

interface PreparedLine {
  item: LoadedItem;
  quantity: number;
  previouslyReturnedQuantity: number;
  disposition: SalesReturnStockDisposition;
  conditionNote: string | null;
  fulfillmentId: string | null;
  discountAmount: Decimal;
  subtotalExVat: Decimal;
  vatAmount: Decimal;
  totalIncVat: Decimal;
  baseSubtotalExVat: Decimal;
  baseVatAmount: Decimal;
  baseTotalIncVat: Decimal;
}

interface PreparedAllocation {
  debtId: string | null;
  installmentId: string | null;
  amount: Decimal;
  baseAmount: Decimal;
}

export class SalesReturnsService {
  static async get(id: string) {
    const record = await SalesReturnsRepository.findById(id);
    if (!record) throw new NotFoundError('Sales return not found');
    return serializeSalesReturn(record);
  }

  static async create(
    salesOrderId: string,
    input: ReturnSalesOrderInput,
    user: SalesMutationUser,
    context: SalesRequestContext = {}
  ) {
    assertSalesAdmin(user);
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    if (!idempotencyKey) throw new ValidationError('Idempotency key is required');
    const fingerprint = returnFingerprint(salesOrderId, input);

    try {
      return await runFinancialTransaction(async (tx) => {
        await verifyAdminPassword(user.userId, input.accountPassword, {
          action: 'RETURN_SALES_ORDER',
          recordType: 'SALES_ORDER',
          recordId: salesOrderId,
          ipAddress: context.ipAddress,
          domainLabel: 'sales order returns',
        }, tx);

        const replay = await SalesReturnsRepository.findByIdempotencyKey(idempotencyKey, tx);
        if (replay) {
          assertIdempotentReplay({ existingFingerprint: replay.requestFingerprint, incomingFingerprint: fingerprint });
          return serializeSalesReturn(replay);
        }

        const [order, actor, settings] = await Promise.all([
          SalesReturnsRepository.loadOrder(salesOrderId, tx),
          SalesReturnsRepository.findActor(user.userId, tx),
          SalesReturnsRepository.findSettings(tx),
        ]);
        if (!order) throw new NotFoundError('Sales order not found');
        if (!actor) throw new NotFoundError('User not found');
        if (!settings) throw new SalesConflictError('Business settings are missing; configure return policy before posting a return');
        if (!RETURNABLE_STATUSES.has(order.fulfillmentStatus)) {
          throw new SalesConflictError('Only delivered or partially returned orders can be returned');
        }

        const processedAt = new Date();
        const returnDate = todayInBusinessTimezone(undefined, processedAt);
        const orderDate = prismaDateToBusinessDate(order.orderDate);
        const deadline = addDays(orderDate, settings.returnWindowDays);
        const expired = compareBusinessDates(returnDate, deadline) > 0;
        if (expired && (!input.overrideReturnWindow || !input.windowOverrideReason)) {
          throw new SalesConflictError(`Return window expired on ${deadline}; an admin override reason is required`);
        }
        if (!expired && input.overrideReturnWindow) {
          throw new ValidationError('Return-window override is not allowed before the configured deadline');
        }

        const preparedLines = prepareLines(order, input, order.currency);
        const delivery = prepareDelivery(order, input.returnDeliveryFee);
        const subtotalExVat = sumMoney([
          ...preparedLines.map((line) => line.subtotalExVat),
          delivery.subtotalExVat,
        ], order.currency);
        const vatAmount = sumMoney([
          ...preparedLines.map((line) => line.vatAmount),
          delivery.vatAmount,
        ], order.currency);
        const totalIncVat = sumMoney([
          ...preparedLines.map((line) => line.totalIncVat),
          delivery.totalIncVat,
        ], order.currency);
        assertComponents(subtotalExVat, vatAmount, totalIncVat, order.currency);
        const baseSubtotalExVat = sumMoney([
          ...preparedLines.map((line) => line.baseSubtotalExVat),
          delivery.baseSubtotalExVat,
        ]);
        const baseVatAmount = sumMoney([
          ...preparedLines.map((line) => line.baseVatAmount),
          delivery.baseVatAmount,
        ]);
        const baseTotalIncVat = sumMoney([baseSubtotalExVat, baseVatAmount]);

        const obligations = deriveObligations(order);
        const currentOutstanding = sumMoney(obligations.map((target) => target.remaining), order.currency);
        if (compareMoney(order.remainingAmount, ZERO_MONEY, order.currency) > 0 && obligations.length === 0) {
          throw new SalesConflictError('The order has an unexplained remaining balance and no linked receivable');
        }
        const settlement = deriveReturnSettlement(totalIncVat, currentOutstanding, order.currency);
        validateRefundMethod(input.refundMethod, settlement.refundable, Boolean(order.customerId), order.currency);
        const baseReceivableRelief = minMoney(toBaseAmount(
          settlement.receivableRelief,
          order.currency,
          order.exchangeRate,
          Decimal.ROUND_HALF_UP
        ), baseTotalIncVat);
        const baseRefundable = subtractMoney(baseTotalIncVat, baseReceivableRelief);
        const allocations = allocateReceivableRelief(
          obligations,
          settlement.receivableRelief,
          baseReceivableRelief,
          order.currency,
          order.exchangeRate
        );

        preflightStock(preparedLines);
        const sequence = order.returns.length + 1;
        const header = await SalesReturnsRepository.createHeader({
          returnNumber: `${order.orderNumber}-R${sequence}`,
          salesOrderId: order.id,
          sequence,
          customerId: order.customerId,
          returnDate: businessDateToPrisma(returnDate),
          processedAt,
          reason: input.reason,
          windowDaysSnapshot: settings.returnWindowDays,
          returnDeadlineSnapshot: businessDateToPrisma(deadline),
          windowOverride: expired,
          windowOverrideReason: expired ? input.windowOverrideReason : null,
          currency: order.currency,
          exchangeRate: order.exchangeRate,
          subtotalExVat,
          vatAmount,
          totalIncVat,
          baseSubtotalExVat,
          baseVatAmount,
          baseTotalIncVat,
          deliveryReturned: input.returnDeliveryFee,
          deliveryTaxTreatment: input.returnDeliveryFee ? order.deliveryTaxTreatment : null,
          deliveryTaxRateSnapshot: input.returnDeliveryFee ? order.deliveryTaxRateSnapshot : null,
          deliveryTaxCodeSnapshot: input.returnDeliveryFee ? order.deliveryTaxCodeSnapshot : null,
          deliveryFeeExVat: input.returnDeliveryFee ? delivery.subtotalExVat : null,
          deliveryVatAmount: input.returnDeliveryFee ? delivery.vatAmount : null,
          deliveryFeeIncVat: input.returnDeliveryFee ? delivery.totalIncVat : null,
          baseDeliveryFeeExVat: input.returnDeliveryFee ? delivery.baseSubtotalExVat : null,
          baseDeliveryVatAmount: input.returnDeliveryFee ? delivery.baseVatAmount : null,
          baseDeliveryFeeIncVat: input.returnDeliveryFee ? delivery.baseTotalIncVat : null,
          receivableReliefAmount: settlement.receivableRelief,
          baseReceivableReliefAmount: baseReceivableRelief,
          refundableAmount: settlement.refundable,
          baseRefundableAmount: baseRefundable,
          refundMethod: input.refundMethod,
          idempotencyKey,
          requestFingerprint: fingerprint,
          processedById: user.userId,
          processedByName: actor.fullName,
          processedByUsername: actor.username,
          createdAt: processedAt,
        }, tx);

        const stockResults = [] as Array<Record<string, unknown>>;
        for (const line of preparedLines) {
          const returnItem = await SalesReturnsRepository.createItem({
            salesReturnId: header.id,
            salesOrderItemId: line.item.id,
            salesOrderStockFulfillmentId: line.fulfillmentId,
            productId: line.item.productId,
            quantity: line.quantity,
            productNameSnapshot: line.item.productNameSnapshot,
            productModelSnapshot: line.item.productModelSnapshot,
            skuSnapshot: line.item.skuSnapshot,
            soldQuantitySnapshot: line.item.quantity,
            unitPriceSnapshot: line.item.unitPrice,
            discountAmount: line.discountAmount,
            subtotalExVat: line.subtotalExVat,
            vatAmount: line.vatAmount,
            totalIncVat: line.totalIncVat,
            baseSubtotalExVat: line.baseSubtotalExVat,
            baseVatAmount: line.baseVatAmount,
            baseTotalIncVat: line.baseTotalIncVat,
            taxRateSnapshot: line.item.taxRateSnapshot,
            taxCodeSnapshot: line.item.taxCodeSnapshot,
            stockDisposition: line.disposition,
            conditionNote: line.conditionNote,
            createdAt: processedAt,
          }, tx);

          let movementId: string | null = null;
          if (line.item.product?.trackStock && line.disposition === SalesReturnStockDisposition.SELLABLE) {
            const product = await InventoryRepository.findProduct(line.item.product.id, tx);
            if (!product) throw new NotFoundError('Product not found');
            const before = product.stockQuantity;
            const after = before + line.quantity;
            assertStockCeiling(after);
            const changed = await InventoryRepository.compareAndSetQuantity(product.id, before, after, tx);
            if (changed.count !== 1) throw new SalesConflictError('Stock changed; retry the return');
            const movement = await InventoryRepository.createMovement({
              productId: product.id,
              movementType: StockMovementType.SALE_RETURN_SELLABLE,
              quantityChange: line.quantity,
              quantityBefore: before,
              quantityAfter: after,
              reason: `Sellable return ${header.returnNumber} / مرتجع صالح للبيع ${header.returnNumber}`,
              note: line.conditionNote,
              referenceType: 'SALES_RETURN_ITEM',
              referenceId: returnItem.id,
              createdById: user.userId,
            }, tx);
            movementId = movement.id;
            await tx.salesReturnItem.update({ where: { id: returnItem.id }, data: { stockMovementId: movement.id } });
            stockResults.push({ itemId: line.item.id, productId: product.id, quantity: line.quantity, before, after, movementId });
          }

          // Keep the original fulfillment intact. Returns are separate offsets,
          // including damaged/quarantined lines with no sellable-stock movement.
          // Legacy REVERSED remains reserved for a real cancellation movement.
          if (!movementId) stockResults.push({ itemId: line.item.id, productId: line.item.productId, quantity: line.quantity, disposition: line.disposition, movementId: null });
        }

        for (const allocation of allocations) {
          await tx.salesReturnReceivableAllocation.create({
            data: {
              salesReturnId: header.id,
              debtId: allocation.debtId,
              installmentId: allocation.installmentId,
              amount: allocation.amount,
              exchangeRate: order.exchangeRate,
              baseAmount: allocation.baseAmount,
              createdAt: processedAt,
            },
          });
        }
        await updateFinancialStatuses(order, allocations, returnDate, processedAt, tx);

        let settlementReference: string | null = null;
        if (input.refundMethod === SalesReturnRefundMethod.CASH_OUT) {
          const cashRefund = await tx.cashRefund.create({ data: {
            salesReturnId: header.id,
            customerId: order.customerId,
            amount: settlement.refundable,
            currency: order.currency,
            exchangeRate: order.exchangeRate,
            baseAmount: baseRefundable,
            processedAt,
            processedById: user.userId,
            processedByName: actor.fullName,
            processedByUsername: actor.username,
            reason: input.reason,
          } });
          settlementReference = cashRefund.id;
        } else if (input.refundMethod === SalesReturnRefundMethod.STORE_CREDIT) {
          const credit = await tx.customerCredit.create({ data: {
            salesReturnId: header.id,
            customerId: order.customerId!,
            issuedAmount: settlement.refundable,
            currency: order.currency,
            exchangeRate: order.exchangeRate,
            baseAmount: baseRefundable,
            issuedAt: processedAt,
            issuedById: user.userId,
            issuedByName: actor.fullName,
            issuedByUsername: actor.username,
            reason: input.reason,
          } });
          settlementReference = credit.id;
        }

        const fullyReturned = order.items.every((item) => {
          const newlyReturned = preparedLines.find((line) => line.item.id === item.id)?.quantity ?? 0;
          return item.returnItems.reduce((total, prior) => total + prior.quantity, 0) + newlyReturned === item.quantity;
        });
        const newStatus = fullyReturned
          ? SalesOrderFulfillmentStatus.RETURNED
          : SalesOrderFulfillmentStatus.PARTIALLY_RETURNED;
        await tx.salesOrder.update({ where: { id: order.id }, data: { fulfillmentStatus: newStatus, updatedById: user.userId } });

        await writeSalesAudit({
          recordType: SalesAuditRecordType.SALES_ORDER,
          recordId: order.id,
          salesOrderId: order.id,
          action: SalesAuditAction.RETURN,
          changedById: user.userId,
          changedByName: actor.fullName,
          changedByUsername: actor.username,
          reason: input.reason,
          beforeValues: {
            fulfillmentStatus: order.fulfillmentStatus,
            receivableOutstanding: moneyToApiString(currentOutstanding, order.currency),
          },
          afterValues: {
            returnId: header.id,
            returnNumber: header.returnNumber,
            fulfillmentStatus: newStatus,
            lines: preparedLines.map((line) => ({
              salesOrderItemId: line.item.id,
              productName: line.item.productNameSnapshot,
              soldQuantity: line.item.quantity,
              previouslyReturnedQuantity: line.previouslyReturnedQuantity,
              returnedQuantity: line.quantity,
              cumulativeReturnedQuantity: line.previouslyReturnedQuantity + line.quantity,
              subtotalExVat: moneyToApiString(line.subtotalExVat, order.currency),
              vatAmount: moneyToApiString(line.vatAmount, order.currency),
              totalIncVat: moneyToApiString(line.totalIncVat, order.currency),
              taxRate: line.item.taxRateSnapshot.toFixed(3),
              taxCode: line.item.taxCodeSnapshot,
              disposition: line.disposition,
              fulfillmentId: line.fulfillmentId,
            })),
            deliveryReturned: input.returnDeliveryFee,
            totalIncVat: moneyToApiString(totalIncVat, order.currency),
            receivableRelief: moneyToApiString(settlement.receivableRelief, order.currency),
            receivableOutstandingAfter: moneyToApiString(subtractMoney(currentOutstanding, settlement.receivableRelief, order.currency), order.currency),
            refundableAmount: moneyToApiString(settlement.refundable, order.currency),
            refundMethod: input.refundMethod,
            settlementReference,
            stock: stockResults,
            returnWindowDays: settings.returnWindowDays,
            returnDeadline: deadline,
            windowOverride: expired,
            windowOverrideReason: expired ? input.windowOverrideReason : null,
            idempotencyKey,
          } as Prisma.InputJsonObject,
          requestId: context.requestId,
          ipAddress: context.ipAddress,
        }, tx);

        const saved = await SalesReturnsRepository.findById(header.id, tx);
        if (!saved) throw new SalesConflictError('Posted return could not be reloaded');
        assertPostedReturn(saved);
        return serializeSalesReturn(saved);
      });
    } catch (error) {
      if (isIdempotencyCollision(error)) {
        return runFinancialTransaction(async (tx) => {
          const replay = await SalesReturnsRepository.findByIdempotencyKey(idempotencyKey, tx);
          if (!replay) throw error;
          assertIdempotentReplay({ existingFingerprint: replay.requestFingerprint, incomingFingerprint: fingerprint });
          return serializeSalesReturn(replay);
        });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new SalesConflictError('Another return changed this order; refresh and retry');
      }
      throw error;
    }
  }
}

function prepareLines(order: LoadedOrder, input: ReturnSalesOrderInput, currency: Currency): PreparedLine[] {
  const byId = new Map(order.items.map((item) => [item.id, item]));
  return input.items.map((requested) => {
    const item = byId.get(requested.salesOrderItemId);
    if (!item) throw new NotFoundError('Sales order item not found');
    const previouslyReturnedQuantity = item.returnItems.reduce((total, prior) => total + prior.quantity, 0);
    if (previouslyReturnedQuantity + requested.quantity > item.quantity) {
      throw new SalesConflictError('Returned quantity exceeds the quantity originally sold');
    }
    assertComponents(item.lineTotal, item.vatAmount, item.lineTotalIncVat, currency);
    // The legacy sale schema stores base ex-VAT but not base VAT/gross.
    // Anchor the missing components to the FULL original VAT/rate, never
    // convert an individual partial return or resolve current configuration.
    const originalBaseVat = toBaseAmount(item.vatAmount, currency, order.exchangeRate, Decimal.ROUND_HALF_UP);
    const amounts = allocateReturnLine({
      original: {
        discountAmount: item.discountAmount ?? ZERO_MONEY,
        subtotalExVat: item.lineTotal,
        vatAmount: item.vatAmount,
        totalIncVat: item.lineTotalIncVat,
        baseSubtotalExVat: item.baseLineTotal,
        baseVatAmount: originalBaseVat,
        baseTotalIncVat: sumMoney([item.baseLineTotal, originalBaseVat]),
      },
      soldQuantity: item.quantity,
      returnQuantity: requested.quantity,
      previousReturns: item.returnItems,
      currency,
    });
    const { discountAmount, subtotalExVat, vatAmount, totalIncVat, baseSubtotalExVat, baseVatAmount, baseTotalIncVat } = amounts;
    assertComponents(subtotalExVat, vatAmount, totalIncVat, currency);

    const activeFulfillments = item.stockFulfillments.filter((record) => record.status === SalesOrderStockFulfillmentStatus.ACTIVE);
    let fulfillmentId: string | null = null;
    if (item.product?.trackStock) {
      if (activeFulfillments.length !== 1 || activeFulfillments[0].quantity < previouslyReturnedQuantity + requested.quantity) {
        throw new SalesConflictError('Stock-tracked return lacks sufficient compatible fulfillment history');
      }
      fulfillmentId = activeFulfillments[0].id;
    }
    assertComponents(baseSubtotalExVat, baseVatAmount, baseTotalIncVat, Currency.USD);
    return {
      item,
      quantity: requested.quantity,
      previouslyReturnedQuantity,
      disposition: requested.stockDisposition,
      conditionNote: requested.conditionNote?.trim() || null,
      fulfillmentId,
      discountAmount,
      subtotalExVat,
      vatAmount,
      totalIncVat,
      baseSubtotalExVat,
      baseVatAmount,
      baseTotalIncVat,
    };
  }).sort((left, right) => (left.item.productId ?? '').localeCompare(right.item.productId ?? '') || left.item.id.localeCompare(right.item.id));
}

function prepareDelivery(order: LoadedOrder, requested: boolean) {
  if (!requested) return zeroComponents();
  if (order.returns.some((record) => record.deliveryReturned)) {
    throw new SalesConflictError('The delivery fee has already been returned');
  }
  if (order.deliveryFeeIncVat === null || order.deliveryFeeExVat === null) {
    throw new SalesConflictError('This order has no delivery fee to return');
  }
  assertComponents(order.deliveryFeeExVat, order.deliveryVatAmount, order.deliveryFeeIncVat, order.currency);
  const baseSubtotalExVat = toBaseAmount(order.deliveryFeeExVat, order.currency, order.exchangeRate, Decimal.ROUND_HALF_UP);
  const baseVatAmount = toBaseAmount(order.deliveryVatAmount, order.currency, order.exchangeRate, Decimal.ROUND_HALF_UP);
  return {
    subtotalExVat: parseMoney(order.deliveryFeeExVat, order.currency),
    vatAmount: parseMoney(order.deliveryVatAmount, order.currency),
    totalIncVat: parseMoney(order.deliveryFeeIncVat, order.currency),
    baseSubtotalExVat,
    baseVatAmount,
    baseTotalIncVat: sumMoney([baseSubtotalExVat, baseVatAmount]),
  };
}

function zeroComponents() {
  return {
    subtotalExVat: ZERO_MONEY,
    vatAmount: ZERO_MONEY,
    totalIncVat: ZERO_MONEY,
    baseSubtotalExVat: ZERO_MONEY,
    baseVatAmount: ZERO_MONEY,
    baseTotalIncVat: ZERO_MONEY,
  };
}

function deriveObligations(order: LoadedOrder) {
  if (order.debt) {
    if (order.settlement !== 'DEBT' || order.debt.customerId !== order.customerId || order.debt.currency !== order.currency || order.debt.status === DebtStatus.CANCELLED) {
      throw new SalesConflictError('The linked debt does not safely belong to this order');
    }
    const paid = sumMoney(order.debt.paymentAllocations.filter((allocation) => !allocation.voidedAt && !allocation.payment.voidedAt).map((allocation) => allocation.amount), order.currency);
    const returned = sumMoney(order.debt.returnAllocations.map((allocation) => allocation.amount), order.currency);
    return [{
      debtId: order.debt.id,
      installmentId: null,
      remaining: nonNegativeRemaining(order.debt.originalAmount, sumMoney([paid, returned], order.currency), order.currency),
    }];
  }
  if (order.installmentPlan) {
    if (order.settlement !== 'INSTALLMENT' || order.installmentPlan.customerId !== order.customerId || order.installmentPlan.currency !== order.currency || order.installmentPlan.status === InstallmentPlanStatus.CANCELLED) {
      throw new SalesConflictError('The linked installment plan does not safely belong to this order');
    }
    return order.installmentPlan.installments.map((installment) => {
      if (installment.status === InstallmentStatus.CANCELLED) throw new SalesConflictError('A linked installment is cancelled');
      const paid = sumMoney(installment.paymentAllocations.filter((allocation) => !allocation.voidedAt && !allocation.payment.voidedAt).map((allocation) => allocation.amount), order.currency);
      const returned = sumMoney(installment.returnAllocations.map((allocation) => allocation.amount), order.currency);
      return {
        debtId: null,
        installmentId: installment.id,
        remaining: nonNegativeRemaining(installment.amountDue, sumMoney([paid, returned], order.currency), order.currency),
      };
    });
  }
  if (order.settlement !== 'NONE') throw new SalesConflictError('The order settlement link is inconsistent');
  return [];
}

function allocateReceivableRelief(
  obligations: Array<{ debtId: string | null; installmentId: string | null; remaining: Decimal }>,
  relief: Decimal,
  baseRelief: Decimal,
  currency: Currency,
  exchangeRate: Decimal
): PreparedAllocation[] {
  let remaining = relief;
  let remainingBase = baseRelief;
  const results: PreparedAllocation[] = [];
  const positive = obligations.filter((target) => compareMoney(target.remaining, ZERO_MONEY, currency) > 0);
  for (let index = 0; index < positive.length && compareMoney(remaining, ZERO_MONEY, currency) > 0; index += 1) {
    const target = positive[index];
    const amount = Decimal.min(remaining, target.remaining);
    const isLast = index === positive.length - 1 || amount.equals(remaining);
    const baseAmount = isLast
      ? remainingBase
      : toBaseAmount(amount, currency, exchangeRate, Decimal.ROUND_HALF_UP);
    results.push({ debtId: target.debtId, installmentId: target.installmentId, amount, baseAmount });
    remaining = subtractMoney(remaining, amount, currency);
    remainingBase = subtractMoney(remainingBase, baseAmount);
  }
  if (compareMoney(remaining, ZERO_MONEY, currency) !== 0) throw new SalesConflictError('Receivable return allocation is incomplete');
  return results;
}

async function updateFinancialStatuses(
  order: LoadedOrder,
  allocations: PreparedAllocation[],
  businessDate: string,
  processedAt: Date,
  tx: Prisma.TransactionClient
) {
  if (order.debt) {
    const added = sumMoney(allocations.filter((item) => item.debtId === order.debt!.id).map((item) => item.amount), order.currency);
    const paid = sumMoney(order.debt.paymentAllocations.filter((item) => !item.voidedAt && !item.payment.voidedAt).map((item) => item.amount), order.currency);
    const credited = sumMoney(order.debt.returnAllocations.map((item) => item.amount), order.currency);
    const totalSettled = sumMoney([paid, credited, added], order.currency);
    const remainingBalance = nonNegativeRemaining(order.debt.originalAmount, totalSettled, order.currency);
    await tx.debt.update({ where: { id: order.debt.id }, data: { status: determineDebtStatus({
      balance: { totalPaid: totalSettled, remainingBalance, isFullyPaid: remainingBalance.isZero(), isPartiallyPaid: totalSettled.greaterThan(0) && remainingBalance.greaterThan(0) },
      dueDate: prismaDateToBusinessDate(order.debt.dueDate), businessDate, isCancelled: false,
    }) } });
  }
  if (order.installmentPlan) {
    const statuses: InstallmentStatus[] = [];
    for (const installment of order.installmentPlan.installments) {
      const added = sumMoney(allocations.filter((item) => item.installmentId === installment.id).map((item) => item.amount), order.currency);
      const paid = sumMoney(installment.paymentAllocations.filter((item) => !item.voidedAt && !item.payment.voidedAt).map((item) => item.amount), order.currency);
      const credited = sumMoney(installment.returnAllocations.map((item) => item.amount), order.currency);
      const totalSettled = sumMoney([paid, credited, added], order.currency);
      const remainingBalance = nonNegativeRemaining(installment.amountDue, totalSettled, order.currency);
      const status = determineInstallmentStatus({
        balance: { totalPaid: totalSettled, remainingBalance, isFullyPaid: remainingBalance.isZero(), isPartiallyPaid: totalSettled.greaterThan(0) && remainingBalance.greaterThan(0) },
        dueDate: prismaDateToBusinessDate(installment.dueDate), businessDate, isCancelled: false,
      });
      statuses.push(status);
      await tx.installment.update({ where: { id: installment.id }, data: { status, paidDate: status === InstallmentStatus.PAID ? businessDateToPrisma(businessDate) : null } });
    }
    await tx.installmentPlan.update({ where: { id: order.installmentPlan.id }, data: { status: determineInstallmentPlanStatus({ isCancelled: false, installments: statuses.map((status) => ({ status })) }) } });
  }
}

function validateRefundMethod(method: SalesReturnRefundMethod, refundable: Decimal, hasCustomer: boolean, currency: Currency) {
  const positive = compareMoney(refundable, ZERO_MONEY, currency) > 0;
  if (positive && method === SalesReturnRefundMethod.NONE) throw new ValidationError('Choose cash-out or store credit for the refundable amount');
  if (!positive && method !== SalesReturnRefundMethod.NONE) throw new ValidationError('Refund method must be NONE when the return is fully applied to the balance');
  if (method === SalesReturnRefundMethod.STORE_CREDIT && !hasCustomer) throw new SalesConflictError('Store credit requires a customer');
}

function preflightStock(lines: PreparedLine[]) {
  const increases = new Map<string, number>();
  for (const line of lines) {
    if (!line.item.product?.trackStock || line.disposition !== SalesReturnStockDisposition.SELLABLE) continue;
    const current = increases.get(line.item.product.id) ?? line.item.product.stockQuantity;
    const after = current + line.quantity;
    assertStockCeiling(after);
    increases.set(line.item.product.id, after);
  }
}

function assertStockCeiling(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity > MAX_STOCK_QUANTITY) throw new ValidationError('Resulting stock quantity is too large');
}

function assertComponents(subtotal: Decimal, vat: Decimal, total: Decimal, currency: Currency) {
  if (compareMoney(sumMoney([subtotal, vat], currency), total, currency) !== 0) {
    throw new SalesConflictError('Stored VAT snapshot components do not reconcile');
  }
}

function nonNegativeRemaining(original: Decimal, settled: Decimal, currency: Currency) {
  if (compareMoney(settled, original, currency) > 0) throw new SalesConflictError('Stored allocations exceed the obligation amount');
  return subtractMoney(original, settled, currency);
}

function addDays(date: string, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new SalesConflictError('Configured return window is invalid');
  const value = businessDateToPrisma(date);
  value.setUTCDate(value.getUTCDate() + days);
  return prismaDateToBusinessDate(value);
}

function returnFingerprint(salesOrderId: string, input: ReturnSalesOrderInput) {
  return createIdempotencyFingerprint({
    salesOrderId,
    items: [...input.items].sort((left, right) => left.salesOrderItemId.localeCompare(right.salesOrderItemId)).map((item) => ({
      salesOrderItemId: item.salesOrderItemId,
      quantity: item.quantity,
      stockDisposition: item.stockDisposition,
      conditionNote: item.conditionNote?.trim() || null,
    })),
    returnDeliveryFee: input.returnDeliveryFee,
    refundMethod: input.refundMethod,
    reason: input.reason.trim(),
    overrideReturnWindow: input.overrideReturnWindow,
    windowOverrideReason: input.windowOverrideReason?.trim() || null,
  });
}

function assertPostedReturn(record: SalesReturnRecord) {
  const itemTotal = sumMoney(record.items.map((item) => item.totalIncVat), record.currency);
  const deliveryTotal = record.deliveryFeeIncVat ?? ZERO_MONEY;
  if (compareMoney(sumMoney([itemTotal, deliveryTotal], record.currency), record.totalIncVat, record.currency) !== 0 ||
      compareMoney(sumMoney([record.receivableReliefAmount, record.refundableAmount], record.currency), record.totalIncVat, record.currency) !== 0) {
    throw new SalesConflictError('Posted return failed financial reconciliation');
  }
}

function serializeSalesReturn(record: SalesReturnRecord) {
  return {
    ...record,
    salesOrder: { ...record.salesOrder, orderDate: prismaDateToBusinessDate(record.salesOrder.orderDate) },
    returnDate: prismaDateToBusinessDate(record.returnDate),
    returnDeadlineSnapshot: prismaDateToBusinessDate(record.returnDeadlineSnapshot),
    processedAt: record.processedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    exchangeRate: record.exchangeRate.toFixed(6),
    subtotalExVat: moneyToApiString(record.subtotalExVat, record.currency),
    vatAmount: moneyToApiString(record.vatAmount, record.currency),
    totalIncVat: moneyToApiString(record.totalIncVat, record.currency),
    baseSubtotalExVat: moneyToApiString(record.baseSubtotalExVat),
    baseVatAmount: moneyToApiString(record.baseVatAmount),
    baseTotalIncVat: moneyToApiString(record.baseTotalIncVat),
    receivableReliefAmount: moneyToApiString(record.receivableReliefAmount, record.currency),
    baseReceivableReliefAmount: moneyToApiString(record.baseReceivableReliefAmount),
    refundableAmount: moneyToApiString(record.refundableAmount, record.currency),
    baseRefundableAmount: moneyToApiString(record.baseRefundableAmount),
    deliveryTaxRateSnapshot: record.deliveryTaxRateSnapshot?.toFixed(3) ?? null,
    deliveryFeeExVat: record.deliveryFeeExVat ? moneyToApiString(record.deliveryFeeExVat, record.currency) : null,
    deliveryVatAmount: record.deliveryVatAmount ? moneyToApiString(record.deliveryVatAmount, record.currency) : null,
    deliveryFeeIncVat: record.deliveryFeeIncVat ? moneyToApiString(record.deliveryFeeIncVat, record.currency) : null,
    items: record.items.map((item) => ({
      ...item,
      unitPriceSnapshot: moneyToApiString(item.unitPriceSnapshot, record.currency),
      discountAmount: moneyToApiString(item.discountAmount, record.currency),
      subtotalExVat: moneyToApiString(item.subtotalExVat, record.currency),
      vatAmount: moneyToApiString(item.vatAmount, record.currency),
      totalIncVat: moneyToApiString(item.totalIncVat, record.currency),
      baseSubtotalExVat: moneyToApiString(item.baseSubtotalExVat),
      baseVatAmount: moneyToApiString(item.baseVatAmount),
      baseTotalIncVat: moneyToApiString(item.baseTotalIncVat),
      taxRateSnapshot: item.taxRateSnapshot.toFixed(3),
      createdAt: item.createdAt.toISOString(),
    })),
    receivableAllocations: record.receivableAllocations.map((allocation) => ({
      ...allocation,
      amount: moneyToApiString(allocation.amount, record.currency),
      baseAmount: moneyToApiString(allocation.baseAmount),
      exchangeRate: allocation.exchangeRate.toFixed(6),
      createdAt: allocation.createdAt.toISOString(),
    })),
    cashRefund: record.cashRefund ? { ...record.cashRefund, amount: moneyToApiString(record.cashRefund.amount, record.currency), baseAmount: moneyToApiString(record.cashRefund.baseAmount), exchangeRate: record.cashRefund.exchangeRate.toFixed(6), processedAt: record.cashRefund.processedAt.toISOString() } : null,
    customerCredit: record.customerCredit ? { ...record.customerCredit, issuedAmount: moneyToApiString(record.customerCredit.issuedAmount, record.currency), baseAmount: moneyToApiString(record.customerCredit.baseAmount), exchangeRate: record.customerCredit.exchangeRate.toFixed(6), issuedAt: record.customerCredit.issuedAt.toISOString() } : null,
    documentRoute: `/documents/sales-returns/${record.id}`,
  };
}

function isIdempotencyCollision(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' &&
    Array.isArray(error.meta?.target) && error.meta.target.includes('idempotencyKey');
}
