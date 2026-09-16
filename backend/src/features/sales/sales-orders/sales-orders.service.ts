import {
  Currency,
  DeliveryTaxTreatment,
  Prisma,
  Role,
  SalesAuditAction,
  SalesAuditRecordType,
  SalesChannel,
  SalesOrderFulfillmentStatus,
  SalesOrderSettlement,
  SalesOrderStockFulfillmentStatus,
} from '@prisma/client';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import {
  businessDateToPrisma,
  compareBusinessDates,
  getBusinessTimezone,
  prismaDateToBusinessDate,
  timestampToBusinessDate,
  todayInBusinessTimezone,
} from '../../financial/domain/business-date';
import { compareMoney, moneyToApiString, parseMoney, parseExchangeRate, subtractMoney, sumMoney, toBaseAmount, ZERO_MONEY } from '../../financial/domain/money';
import { ExchangeRatesService } from '../../financial/exchange-rates/exchange-rates.service';
import { assertIdempotentReplay, createIdempotencyFingerprint, normalizeIdempotencyKey } from '../../financial/infrastructure/idempotency';
import { recordCounterPayment } from '../../financial/payments/counter-payment';
import { PaymentsRepository } from '../../financial/payments/payments.repository';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { DebtsService } from '../../financial/debts/debts.service';
import { InstallmentPlansService } from '../../financial/installment-plans/installment-plans.service';
import { calculateVatLine } from '../../tax/domain/vat';
import { TaxRepository } from '../../tax/tax.repository';
import { assertSalesAdmin, containsSensitiveSalesOrderFields } from '../authorization/sales-policy';
import { writeSalesAudit } from '../audit/sales-audit';
import { SalesAuditRepository } from '../audit/sales-audit.repository';
import {
  assertSalesOrderStatusTransitionAllowed,
  isRoutineForwardSalesOrderTransition,
  isTerminalSalesOrderStatus,
} from '../domain/sales-order-status';
import { SalesConflictError } from '../domain/sales-errors';
import type { SalesMutationUser, SalesRequestContext } from '../domain/sales-types';
import { deriveSalesOrderPaymentStatus } from '../domain/sales-order-totals';
import { SalesOrderRecord, SalesOrdersRepository } from './sales-orders.repository';
import type {
  AddSalesOrderItemInput,
  ChangeSalesOrderPaymentInput,
  ChangeSalesOrderStatusInput,
  CreateSalesOrderDebtInput,
  CreateSalesOrderInput,
  CreateSalesOrderInstallmentPlanInput,
  RestoreSalesOrderInput,
  SalesAuditQueryInput,
  SalesOrderActionInput,
  SalesOrderItemActionInput,
  SalesOrderListQueryInput,
  SalesOrderSummaryQueryInput,
  UpdateSalesOrderInput,
  UpdateSalesOrderItemInput,
} from './sales-orders.validator';

const INVENTORY_DEDUCTIBLE_STATUSES = new Set<SalesOrderFulfillmentStatus>([
  SalesOrderFulfillmentStatus.CONFIRMED,
  SalesOrderFulfillmentStatus.PREPARING,
  SalesOrderFulfillmentStatus.READY_FOR_DELIVERY,
  SalesOrderFulfillmentStatus.OUT_FOR_DELIVERY,
  SalesOrderFulfillmentStatus.DELIVERED,
]);

export class SalesOrdersService {
  static async create(input: CreateSalesOrderInput, user: SalesMutationUser, context: SalesRequestContext) {
    validateOrderDates(input.orderDate, input.deliveryDate);
    const currency = input.currency ?? Currency.USD;
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    if (compareMoney(input.paidAmount, ZERO_MONEY, currency) > 0 && !key) throw new ValidationError('Idempotency key is required for a counter receipt');
    const fingerprint = createIdempotencyFingerprint({ input: { ...input, accountPassword: undefined }, userId: user.userId });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await runFinancialTransaction(async (tx) => {
          if (key) {
            const replay = await SalesOrdersRepository.findByIdempotencyKey(key, tx);
            if (replay) {
              assertIdempotentReplay({ existingFingerprint: replay.idempotencyFingerprint ?? '', incomingFingerprint: fingerprint });
              return serializeSalesOrder(replay);
            }
          }
          const rate = input.exchangeRate ? parseExchangeRate(input.exchangeRate) : await ExchangeRatesService.snapshotFor(currency, businessDateToPrisma(input.orderDate), tx);
          const base = (amount: string | Prisma.Decimal) => toBaseAmount(amount, currency, rate, Prisma.Decimal.ROUND_HALF_UP);
          if (input.customerId && !(await SalesOrdersRepository.findActiveCustomer(input.customerId, tx))) {
            throw new NotFoundError('Customer not found');
          }
          const preparedItems = await prepareItems(input.items, businessDateToPrisma(input.orderDate), tx, currency, rate);
          const deliveryVat = await prepareDeliveryVat(
            input.deliveryFee,
            input.deliveryTaxTreatment ?? DeliveryTaxTreatment.STANDARD,
            input.deliveryTaxProfileId,
            businessDateToPrisma(input.orderDate),
            tx, currency
          );
          const totals = calculateVatAwareOrderTotals(preparedItems, deliveryVat, input.paidAmount, currency);
          const paymentStatus = deriveSalesOrderPaymentStatus(totals.paidAmount, totals.totalAmount);
          validateCustomerRequirement(input.customerId, totals.remainingAmount, user.role === Role.ADMIN);
          validateCreateDebtTerms(input, totals.remainingAmount);
          const orderNumber = await SalesOrdersRepository.nextOrderNumber(Number(input.orderDate.slice(0, 4)), tx);
          const created = await SalesOrdersRepository.create({
            orderNumber,
            idempotencyKey: key, idempotencyFingerprint: key ? fingerprint : null,
            currency, exchangeRate: rate,
            customerId: input.customerId ?? null,
            salesChannel: input.salesChannel,
            orderDate: businessDateToPrisma(input.orderDate),
            deliveryDate: dateOrNull(input.deliveryDate),
            deliveredAt: input.fulfillmentStatus === SalesOrderFulfillmentStatus.DELIVERED
              ? businessDateToPrisma(input.orderDate)
              : null,
            fulfillmentStatus: input.fulfillmentStatus,
            paymentStatus,
            settlement: SalesOrderSettlement.NONE,
            itemsSubtotal: totals.itemsSubtotal,
            ...deliveryVat,
            totalAmount: totals.totalAmount,
            paidAmount: totals.paidAmount,
            remainingAmount: totals.remainingAmount,
            baseSubtotal: base(totals.itemsSubtotal),
            baseDeliveryFee: deliveryVat.deliveryFee === null ? null : base(new Prisma.Decimal(deliveryVat.deliveryFee.toString())),
            baseTotalAmount: base(totals.totalAmount),
            basePaidAmount: base(totals.paidAmount),
            baseRemainingAmount: base(totals.remainingAmount),
            deliveryAddressSnapshot: input.deliveryAddressSnapshot ?? null,
            deliveryNotes: input.deliveryNotes ?? null,
            notes: input.notes ?? null,
            createdById: user.userId,
            items: { create: preparedItems },
          }, tx);

          const finalOrder = compareMoney(totals.remainingAmount, '0.00') > 0 && input.fulfillmentStatus !== SalesOrderFulfillmentStatus.DRAFT
            ? await this.createAndLinkDebt(created, {
                dueDate: input.debtDueDate!,
                description: `Sales order ${created.orderNumber}`,
                notes: null,
                ...creditOverrideInput(input),
              }, user, context, tx)
            : created;

          const payment = compareMoney(totals.paidAmount, ZERO_MONEY, currency) > 0
            ? await recordCounterPayment(tx, {
              sale: finalOrder, customerId: finalOrder.customerId, amount: totals.paidAmount, paymentDate: input.orderDate,
              idempotencyKey: `counter-create:${key}`, fingerprint, snapshot: counterReceiptSnapshot(finalOrder), userId: user.userId,
            }) : null;
          await auditMutation(finalOrder, {
            action: SalesAuditAction.CREATE,
            reason: 'Sales order created',
            beforeValues: {},
            afterValues: { ...orderSnapshot(finalOrder), counterPaymentId: payment?.id ?? null },
          }, user, context, tx);
          return serializeSalesOrder(finalOrder);
        });
      } catch (error) {
        if (key && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const replay = await SalesOrdersRepository.findByIdempotencyKey(key);
          if (replay) {
            assertIdempotentReplay({ existingFingerprint: replay.idempotencyFingerprint ?? '', incomingFingerprint: fingerprint });
            return serializeSalesOrder(replay);
          }
        }
        if (isOrderNumberCollision(error) && attempt === 0) continue;
        throw error;
      }
    }
    throw new ValidationError('Unable to allocate a sales order number');
  }

  static async list(query: SalesOrderListQueryInput) {
    const result = await SalesOrdersRepository.list(query);
    return {
      items: result.items.map(serializeSalesOrder),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  static async get(id: string) {
    const order = await SalesOrdersRepository.findById(id);
    if (!order) throw new NotFoundError('Sales order not found');
    return serializeSalesOrder(order);
  }

  static async summary(query: SalesOrderSummaryQueryInput = {}) {
    // The period cards follow whatever range the page is showing, so the cards and
    // the table can never disagree. The backlog counts below stay global on purpose:
    // an unpaid order from last week is still unpaid while you look at today.
    const today = todayInBusinessTimezone();
    const from = businessDateToPrisma(query.dateFrom ?? today);
    const toInclusive = businessDateToPrisma(query.dateTo ?? query.dateFrom ?? today);
    if (compareBusinessDates(prismaDateToBusinessDate(toInclusive), prismaDateToBusinessDate(from)) < 0) {
      throw new ValidationError('Summary date range cannot end before it starts');
    }
    const toExclusive = new Date(toInclusive);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    const result = await SalesOrdersRepository.summary(from, toExclusive);
    const grossSales = parseMoney(result.todayAggregate._sum.baseTotalAmount ?? ZERO_MONEY);
    const returns = parseMoney(result.returnsAggregate?._sum.baseTotalIncVat ?? ZERO_MONEY);
    return {
      periodSales: moneyToApiString(grossSales),
      periodGrossSales: moneyToApiString(grossSales),
      periodReturns: moneyToApiString(returns),
      periodNetSales: moneyToApiString(subtractMoney(grossSales, returns)),
      periodOrders: result.todayAggregate._count._all,
      pendingDelivery: result.pendingDelivery,
      unpaidOrders: result.unpaidOrders,
      partialPayments: result.partialPayments,
    };
  }

  static async update(id: string, input: UpdateSalesOrderInput, user: SalesMutationUser, context: SalesRequestContext) {
    const fields = Object.keys(input).filter((field) => !['reason', 'accountPassword', 'debtDueDate', 'deliveryTaxProfileId', 'overrideCreditLimit', 'creditLimitOverrideReason'].includes(field));
    if (!fields.length) throw new ValidationError('At least one sales order field is required');
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredOrder(id, tx);
      assertEditable(existing);
      const moneyOrIdentityChange = fields.some((field) => ['customerId', 'orderDate', 'deliveryFee', 'deliveryTaxTreatment'].includes(field));
      if (moneyOrIdentityChange) assertNoFinancialLink(existing);
      if (!moneyOrIdentityChange && input.debtDueDate) {
        throw new ValidationError('Debt due date is not allowed for this change');
      }
      const sensitive = existing.fulfillmentStatus !== SalesOrderFulfillmentStatus.DRAFT && containsSensitiveSalesOrderFields(fields);
      if (sensitive) await requireAdminVerification(input, user, context, id, 'UPDATE_SALES_ORDER', tx);

      const customerId = input.customerId === undefined ? existing.customerId : input.customerId;
      if (input.customerId && !(await SalesOrdersRepository.findActiveCustomer(input.customerId, tx))) {
        throw new NotFoundError('Customer not found');
      }
      const channel = input.salesChannel ?? existing.salesChannel;
      const orderDate = input.orderDate ?? prismaDateToBusinessDate(existing.orderDate);
      const deliveryDate = input.deliveryDate === undefined ? dateString(existing.deliveryDate) : input.deliveryDate;
      const deliveryFee = input.deliveryFee === undefined ? moneyToApiString(existing.deliveryFee ?? '0.00', existing.currency) : input.deliveryFee ?? '0.00';
      validateOrderDates(orderDate, deliveryDate);
      if (channel === SalesChannel.SHOP_DIRECT && (deliveryDate || compareMoney(deliveryFee, '0.00') !== 0)) {
        throw new ValidationError('Shop-direct orders cannot contain delivery date or fee');
      }
      const deliveryChanged = input.deliveryFee !== undefined || input.deliveryTaxTreatment !== undefined;
      const deliveryVat = deliveryChanged
        ? await prepareDeliveryVat(
            input.deliveryFee === undefined ? moneyToApiString(existing.deliveryFee ?? '0.00', existing.currency) : input.deliveryFee,
            input.deliveryTaxTreatment ?? existing.deliveryTaxTreatment,
            input.deliveryTaxProfileId,
            businessDateToPrisma(orderDate),
            tx, existing.currency
          )
        : null;
      let updated = await SalesOrdersRepository.update(id, {
        ...(input.customerId !== undefined ? { customerId } : {}),
        ...(input.salesChannel !== undefined ? { salesChannel: channel } : {}),
        ...(input.orderDate !== undefined ? { orderDate: businessDateToPrisma(orderDate) } : {}),
        ...(input.deliveryDate !== undefined ? { deliveryDate: dateOrNull(deliveryDate) } : {}),
        ...(deliveryVat ? { ...deliveryVat, baseDeliveryFee: deliveryVat.deliveryFee === null ? null : toBaseAmount(new Prisma.Decimal(deliveryVat.deliveryFee.toString()), existing.currency, existing.exchangeRate, Prisma.Decimal.ROUND_HALF_UP) } : {}),
        ...(input.deliveryAddressSnapshot !== undefined ? { deliveryAddressSnapshot: input.deliveryAddressSnapshot } : {}),
        ...(input.deliveryNotes !== undefined ? { deliveryNotes: input.deliveryNotes } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedById: user.userId,
      }, tx);
      if (moneyOrIdentityChange) {
        updated = await this.recalculateOrder(id, input.debtDueDate, user, context, tx, input);
      }
      await auditMutation(updated, {
        action: SalesAuditAction.UPDATE_DETAILS,
        reason: input.reason ?? 'Sales order details updated',
        beforeValues: changedValues(existing, fields),
        afterValues: changedValues(updated, fields),
      }, user, context, tx);
      return serializeSalesOrder(updated);
    });
  }

  static async addItem(id: string, input: AddSalesOrderItemInput, user: SalesMutationUser, context: SalesRequestContext) {
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredOrder(id, tx);
      assertEditable(existing);
      assertNoFinancialLink(existing);
      if (existing.fulfillmentStatus !== SalesOrderFulfillmentStatus.DRAFT) {
        await requireAdminVerification(input, user, context, id, 'ADD_SALES_ORDER_ITEM', tx);
      }
      const prepared = (await prepareItems([input], existing.orderDate, tx, existing.currency, existing.exchangeRate))[0];
      const item = await SalesOrdersRepository.addItem({ salesOrderId: id, ...prepared }, tx);
      const updated = await this.recalculateOrder(id, input.debtDueDate, user, context, tx, input);
      await auditMutation(updated, {
        recordType: SalesAuditRecordType.SALES_ORDER_ITEM,
        recordId: item.id,
        action: SalesAuditAction.ADD_ITEM,
        reason: input.reason ?? 'Sales order item added',
        beforeValues: {},
        afterValues: itemSnapshot(item, existing.currency),
      }, user, context, tx);
      return serializeSalesOrder(updated);
    });
  }

  static async updateItem(orderId: string, itemId: string, input: UpdateSalesOrderItemInput, user: SalesMutationUser, context: SalesRequestContext) {
    const fields = Object.keys(input).filter((field) => !['reason', 'accountPassword', 'overrideCreditLimit', 'creditLimitOverrideReason'].includes(field));
    if (!fields.length) throw new ValidationError('At least one item field is required');
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredOrder(orderId, tx);
      assertEditable(existing);
      assertNoFinancialLink(existing);
      const item = await SalesOrdersRepository.findItemById(itemId, tx);
      if (!item || item.salesOrderId !== orderId) throw new NotFoundError('Sales order item not found');
      if (await SalesOrdersRepository.hasActiveStockFulfillmentForItem(itemId, tx)) {
        throw activeStockLineConflict();
      }
      if (existing.fulfillmentStatus !== SalesOrderFulfillmentStatus.DRAFT) {
        await requireAdminVerification(input, user, context, orderId, 'UPDATE_SALES_ORDER_ITEM', tx);
      }
      const merged = {
        productId: input.productId === undefined ? item.productId : input.productId,
        manualProductName: input.manualProductName === undefined ? item.manualProductName : input.manualProductName,
        manualProductModel: input.manualProductModel === undefined ? item.manualProductModel : input.manualProductModel,
        quantity: input.quantity ?? item.quantity,
        unitPrice: input.unitPrice ?? moneyToApiString(item.unitPrice, existing.currency),
        discountAmount: input.discountAmount === undefined ? moneyToApiString(item.discountAmount ?? '0.00', existing.currency) : input.discountAmount,
        taxProfileId: input.taxProfileId,
        priceIncludesVat: input.priceIncludesVat ?? item.product?.priceIncludesVat ?? true,
        notes: input.notes === undefined ? item.notes : input.notes,
      };
      const prepared = (await prepareItems([merged], existing.orderDate, tx, existing.currency, existing.exchangeRate))[0];
      const changedItem = await SalesOrdersRepository.updateItem(itemId, prepared, tx);
      const updated = await this.recalculateOrder(orderId, input.debtDueDate, user, context, tx, input);
      await auditMutation(updated, {
        recordType: SalesAuditRecordType.SALES_ORDER_ITEM,
        recordId: itemId,
        action: SalesAuditAction.UPDATE_ITEM,
        reason: input.reason ?? 'Sales order item updated',
        beforeValues: itemSnapshot(item, existing.currency),
        afterValues: itemSnapshot(changedItem, existing.currency),
      }, user, context, tx);
      return serializeSalesOrder(updated);
    });
  }

  static async removeItem(orderId: string, itemId: string, input: SalesOrderItemActionInput, user: SalesMutationUser, context: SalesRequestContext) {
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredOrder(orderId, tx);
      assertEditable(existing);
      assertNoFinancialLink(existing);
      if (existing.items.length <= 1) throw new SalesConflictError('The last item cannot be removed from an order');
      const item = existing.items.find((candidate) => candidate.id === itemId);
      if (!item) throw new NotFoundError('Sales order item not found');
      if (await SalesOrdersRepository.hasActiveStockFulfillmentForItem(itemId, tx)) {
        throw activeStockLineConflict();
      }
      if (existing.fulfillmentStatus !== SalesOrderFulfillmentStatus.DRAFT) {
        await requireAdminVerification(input, user, context, orderId, 'REMOVE_SALES_ORDER_ITEM', tx);
      }
      await SalesOrdersRepository.removeItem(itemId, tx);
      const updated = await this.recalculateOrder(orderId, input.debtDueDate, user, context, tx, input);
      await auditMutation(updated, {
        recordType: SalesAuditRecordType.SALES_ORDER_ITEM,
        recordId: itemId,
        action: SalesAuditAction.REMOVE_ITEM,
        reason: input.reason ?? 'Sales order item removed',
        beforeValues: itemSnapshot(item, existing.currency),
        afterValues: {},
      }, user, context, tx);
      return serializeSalesOrder(updated);
    });
  }

  static async changeStatus(id: string, input: ChangeSalesOrderStatusInput, user: SalesMutationUser, context: SalesRequestContext) {
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredOrder(id, tx);
      assertSalesOrderStatusTransitionAllowed(existing.salesChannel, existing.fulfillmentStatus, input.status);
      const sensitive = !isRoutineForwardSalesOrderTransition(existing.fulfillmentStatus, input.status);
      if (sensitive) await requireAdminVerification(input, user, context, id, 'CHANGE_SALES_ORDER_STATUS', tx);
      if (input.status === SalesOrderFulfillmentStatus.CONFIRMED && compareMoney(existing.remainingAmount, '0.00') > 0 && !existing.debtId && !existing.installmentPlanId) {
        throw new SalesConflictError('Create a debt or installment plan before confirming an unpaid draft order');
      }
      const updated = await SalesOrdersRepository.update(id, {
        fulfillmentStatus: input.status,
        updatedById: user.userId,
        ...(input.status === SalesOrderFulfillmentStatus.DELIVERED
          ? { deliveredAt: businessDateToPrisma(todayInBusinessTimezone()) }
          : {}),
      }, tx);
      await auditMutation(updated, {
        action: SalesAuditAction.CHANGE_FULFILLMENT_STATUS,
        reason: input.reason ?? `Fulfillment status changed from ${existing.fulfillmentStatus} to ${input.status}`,
        beforeValues: { fulfillmentStatus: existing.fulfillmentStatus },
        afterValues: { fulfillmentStatus: input.status },
      }, user, context, tx);
      return serializeSalesOrder(updated);
    });
  }

  static async changePayment(id: string, input: ChangeSalesOrderPaymentInput, user: SalesMutationUser, context: SalesRequestContext) {
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = createIdempotencyFingerprint({ orderId: id, input: { ...input, accountPassword: undefined }, userId: user.userId });
    return runFinancialTransaction(async (tx) => {
      if (key) {
        const replay = await PaymentsRepository.findByIdempotencyKey(`counter-change:${key}`, tx);
        if (replay) {
          assertIdempotentReplay({ existingFingerprint: replay.idempotencyFingerprint ?? '', incomingFingerprint: fingerprint });
          return serializeSalesOrder(await requiredOrder(id, tx));
        }
      }
      const existing = await requiredOrder(id, tx);
      assertEditable(existing);
      assertNoFinancialLink({ ...existing, counterPayments: [] });
      await requireAdminVerification(input, user, context, id, 'CHANGE_SALES_ORDER_PAYMENT', tx);
      const totals = calculateVatAwareOrderTotals(existing.items, deliverySnapshot(existing), input.paidAmount, existing.currency);
      const delta = subtractMoney(totals.paidAmount, existing.paidAmount, existing.currency);
      if (delta.greaterThan(0) && !key) throw new ValidationError('Idempotency key is required for a counter receipt');
      if (delta.lessThan(0) && existing.counterPayments?.length) throw new SalesConflictError('Recognized counter cash cannot be reduced by rewriting a paid snapshot');
      validateCustomerRequirement(existing.customerId, totals.remainingAmount, user.role === Role.ADMIN);
      const shouldCreateDebt = validateMutationDebtTerms(existing, totals.remainingAmount, input.debtDueDate);
      let updated = await SalesOrdersRepository.update(id, {
        paidAmount: totals.paidAmount,
        remainingAmount: totals.remainingAmount,
        basePaidAmount: toBaseAmount(totals.paidAmount, existing.currency, existing.exchangeRate, Prisma.Decimal.ROUND_HALF_UP),
        baseRemainingAmount: toBaseAmount(totals.remainingAmount, existing.currency, existing.exchangeRate, Prisma.Decimal.ROUND_HALF_UP),
        paymentStatus: deriveSalesOrderPaymentStatus(totals.paidAmount, totals.totalAmount),
        updatedById: user.userId,
      }, tx);
      if (shouldCreateDebt) {
        updated = await this.createAndLinkDebt(updated, { dueDate: input.debtDueDate!, description: `Sales order ${updated.orderNumber}`, notes: null, ...creditOverrideInput(input) }, user, context, tx);
      }
      const payment = delta.greaterThan(0) ? await recordCounterPayment(tx, {
        sale: updated, customerId: updated.customerId, amount: moneyToApiString(delta, existing.currency),
        paymentDate: todayInBusinessTimezone(), idempotencyKey: `counter-change:${key}`, fingerprint,
        snapshot: counterReceiptSnapshot(updated), userId: user.userId,
      }) : null;
      await auditMutation(updated, {
        action: SalesAuditAction.CHANGE_PAYMENT,
        reason: input.reason,
        beforeValues: { paidAmount: moneyToApiString(existing.paidAmount), remainingAmount: moneyToApiString(existing.remainingAmount), paymentStatus: existing.paymentStatus },
        afterValues: { paidAmount: totals.paidAmount, remainingAmount: totals.remainingAmount, paymentStatus: updated.paymentStatus, counterPaymentId: payment?.id ?? null },
      }, user, context, tx);
      return serializeSalesOrder(updated);
    }).catch(async (error: unknown) => {
      if (key && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return runFinancialTransaction(async (tx) => {
          const replay = await PaymentsRepository.findByIdempotencyKey(`counter-change:${key}`, tx);
          if (!replay) throw error;
          assertIdempotentReplay({ existingFingerprint: replay.idempotencyFingerprint ?? '', incomingFingerprint: fingerprint });
          return serializeSalesOrder(await requiredOrder(id, tx));
        });
      }
      throw error;
    });
  }

  static async cancel(id: string, input: SalesOrderActionInput, user: SalesMutationUser, context: SalesRequestContext) {
    assertSalesAdmin(user);
    return this.terminalMutation(id, input, user, context, SalesOrderFulfillmentStatus.CANCELLED, SalesAuditAction.CANCEL);
  }

  static async returnOrder(id: string, input: SalesOrderActionInput, user: SalesMutationUser, context: SalesRequestContext) {
    assertSalesAdmin(user);
    return this.terminalMutation(id, input, user, context, SalesOrderFulfillmentStatus.RETURNED, SalesAuditAction.RETURN);
  }

  private static async terminalMutation(id: string, input: SalesOrderActionInput, user: SalesMutationUser, context: SalesRequestContext, status: SalesOrderFulfillmentStatus, action: SalesAuditAction) {
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredOrder(id, tx);
      if (existing.debtId || existing.installmentPlanId) {
        throw new SalesConflictError('Unlink or cancel the financial record from the financial screen before changing this order');
      }
      if (await SalesOrdersRepository.hasActiveStockFulfillmentForOrder(id, tx)) {
        throw new SalesConflictError(
          'Stock is still deducted for this order. Restore it before cancelling or returning it. / لا يزال المخزون مخصومًا لهذا الطلب. أعد المخزون قبل إلغائه أو إرجاعه.'
        );
      }
      if (status === SalesOrderFulfillmentStatus.RETURNED) {
        if (existing.fulfillmentStatus !== SalesOrderFulfillmentStatus.DELIVERED) {
          throw new SalesConflictError('Only delivered orders can be returned');
        }
      } else if (isTerminalSalesOrderStatus(existing.fulfillmentStatus)) {
        throw new SalesConflictError('Sales order is already final');
      }
      await requireAdminVerification(input, user, context, id, action === SalesAuditAction.CANCEL ? 'CANCEL_SALES_ORDER' : 'RETURN_SALES_ORDER', tx);
      const updated = await SalesOrdersRepository.update(id, {
        fulfillmentStatus: status,
        updatedById: user.userId,
        ...(status === SalesOrderFulfillmentStatus.CANCELLED ? {
          cancelledAt: new Date(), cancelledById: user.userId, cancelledReason: input.reason,
        } : {}),
      }, tx);
      await auditMutation(updated, {
        action,
        reason: input.reason,
        beforeValues: { fulfillmentStatus: existing.fulfillmentStatus },
        afterValues: { fulfillmentStatus: status },
      }, user, context, tx);
      return serializeSalesOrder(updated);
    });
  }

  static async restore(id: string, input: RestoreSalesOrderInput, user: SalesMutationUser, context: SalesRequestContext) {
    assertSalesAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredOrder(id, tx);
      if (!isTerminalSalesOrderStatus(existing.fulfillmentStatus)) throw new SalesConflictError('Only final sales orders can be restored');
      if (await SalesOrdersRepository.hasPostedReturn(id, tx)) {
        throw new SalesConflictError('Orders with posted returns require a dedicated return reversal and cannot be restored');
      }
      await requireAdminVerification(input, user, context, id, 'RESTORE_SALES_ORDER', tx);
      const updated = await SalesOrdersRepository.update(id, {
        fulfillmentStatus: input.status,
        cancelledAt: null,
        cancelledById: null,
        cancelledReason: null,
        deliveredAt: null,
        updatedById: user.userId,
      }, tx);
      await auditMutation(updated, {
        action: SalesAuditAction.RESTORE,
        reason: input.reason,
        beforeValues: { fulfillmentStatus: existing.fulfillmentStatus },
        afterValues: { fulfillmentStatus: input.status },
      }, user, context, tx);
      return serializeSalesOrder(updated);
    });
  }

  static async createDebt(id: string, input: CreateSalesOrderDebtInput, user: SalesMutationUser, context: SalesRequestContext) {
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredOrder(id, tx);
      const updated = await this.createAndLinkDebt(existing, input, user, context, tx);
      return serializeSalesOrder(updated);
    });
  }

  private static async createAndLinkDebt(existing: SalesOrderRecord, input: CreateSalesOrderDebtInput, user: SalesMutationUser, context: SalesRequestContext, tx: Prisma.TransactionClient) {
    assertCanConvert(existing);
    assertDateNotBefore(input.dueDate, prismaDateToBusinessDate(existing.orderDate), 'Debt due date cannot be before order date');
    const debt = await DebtsService.createDebt(requiredCustomerId(existing), {
      amount: moneyToApiString(existing.remainingAmount, existing.currency),
      currency: existing.currency,
      description: input.description ?? `Sales order ${existing.orderNumber}`,
      dueDate: input.dueDate,
      notes: input.notes ?? null,
      ...creditOverrideInput(input),
    }, user, tx, existing.exchangeRate.toFixed(6));
    const updated = await SalesOrdersRepository.update(existing.id, {
      debtId: debt.id,
      settlement: SalesOrderSettlement.DEBT,
      updatedById: user.userId,
    }, tx);
    await auditMutation(updated, {
      action: SalesAuditAction.LINK_DEBT,
      reason: `Debt created for ${moneyToApiString(existing.remainingAmount)}`,
      beforeValues: { debtId: null, settlement: existing.settlement },
      afterValues: { debtId: updated.debtId, settlement: updated.settlement },
    }, user, context, tx);
    return updated;
  }

  private static async recalculateOrder(
    id: string,
    debtDueDate: string | null | undefined,
    user: SalesMutationUser,
    context: SalesRequestContext,
    tx: Prisma.TransactionClient,
    overrideInput: import('../../financial/credit-limits/credit-limit.service').CreditLimitOverrideInput = {}
  ) {
    const order = await requiredOrder(id, tx);
    const totals = calculateVatAwareOrderTotals(order.items, deliverySnapshot(order), moneyToApiString(order.paidAmount, order.currency), order.currency);
    validateCustomerRequirement(order.customerId, totals.remainingAmount);
    const shouldCreateDebt = validateMutationDebtTerms(order, totals.remainingAmount, debtDueDate);
    let updated = await SalesOrdersRepository.update(id, {
      itemsSubtotal: totals.itemsSubtotal,
      totalAmount: totals.totalAmount,
      remainingAmount: totals.remainingAmount,
      baseSubtotal: toBaseAmount(totals.itemsSubtotal, order.currency, order.exchangeRate, Prisma.Decimal.ROUND_HALF_UP),
      baseTotalAmount: toBaseAmount(totals.totalAmount, order.currency, order.exchangeRate, Prisma.Decimal.ROUND_HALF_UP),
      baseRemainingAmount: toBaseAmount(totals.remainingAmount, order.currency, order.exchangeRate, Prisma.Decimal.ROUND_HALF_UP),
      paymentStatus: deriveSalesOrderPaymentStatus(totals.paidAmount, totals.totalAmount),
      updatedById: user.userId,
    }, tx);
    if (shouldCreateDebt) {
      updated = await this.createAndLinkDebt(updated, {
        dueDate: debtDueDate!,
        description: `Sales order ${updated.orderNumber}`,
        notes: null,
        ...creditOverrideInput(overrideInput),
      }, user, context, tx);
    }
    return updated;
  }

  static async createInstallmentPlan(id: string, input: CreateSalesOrderInstallmentPlanInput, user: SalesMutationUser, context: SalesRequestContext) {
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredOrder(id, tx);
      assertCanConvert(existing);
      assertDateNotBefore(input.startDate, prismaDateToBusinessDate(existing.orderDate), 'Installment start date cannot be before order date');
      const plan = await InstallmentPlansService.createPlan(requiredCustomerId(existing), {
        totalAmount: moneyToApiString(existing.remainingAmount),
        description: input.description ?? `Sales order ${existing.orderNumber}`,
        startDate: input.startDate,
        installmentCount: input.installmentCount,
        frequency: input.frequency,
        notes: input.notes ?? null,
      }, user, tx);
      const updated = await SalesOrdersRepository.update(id, {
        installmentPlanId: plan.id,
        settlement: SalesOrderSettlement.INSTALLMENT,
        updatedById: user.userId,
      }, tx);
      await auditMutation(updated, {
        action: SalesAuditAction.LINK_INSTALLMENT_PLAN,
        reason: `Installment plan created for ${moneyToApiString(existing.remainingAmount)}`,
        beforeValues: { installmentPlanId: null, settlement: existing.settlement },
        afterValues: { installmentPlanId: updated.installmentPlanId, settlement: updated.settlement },
      }, user, context, tx);
      return serializeSalesOrder(updated);
    });
  }

  static async unlinkFinancial(id: string, input: SalesOrderActionInput, user: SalesMutationUser, context: SalesRequestContext) {
    assertSalesAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredOrder(id, tx);
      if (!existing.debtId && !existing.installmentPlanId) throw new SalesConflictError('Sales order has no linked financial record');
      if (await SalesOrdersRepository.hasPostedReturn(id, tx)) {
        throw new SalesConflictError('Financial records used by a posted return cannot be unlinked');
      }
      await requireAdminVerification(input, user, context, id, 'UNLINK_SALES_ORDER_FINANCIAL', tx);
      const beforeValues = { debtId: existing.debtId, installmentPlanId: existing.installmentPlanId, settlement: existing.settlement };
      const updated = await SalesOrdersRepository.update(id, {
        debtId: null,
        installmentPlanId: null,
        settlement: SalesOrderSettlement.NONE,
        updatedById: user.userId,
      }, tx);
      await auditMutation(updated, {
        action: SalesAuditAction.UNLINK_FINANCIAL,
        reason: input.reason,
        beforeValues,
        afterValues: { debtId: null, installmentPlanId: null, settlement: SalesOrderSettlement.NONE },
      }, user, context, tx);
      return serializeSalesOrder(updated);
    });
  }

  static async audit(id: string, query: SalesAuditQueryInput) {
    await this.get(id);
    return SalesAuditRepository.list(id, (query.page - 1) * query.pageSize, query.pageSize);
  }
}

async function requiredOrder(id: string, tx: Prisma.TransactionClient): Promise<SalesOrderRecord> {
  const order = await SalesOrdersRepository.findById(id, tx);
  if (!order) throw new NotFoundError('Sales order not found');
  return order;
}

function assertEditable(order: SalesOrderRecord): void {
  if (new Set<SalesOrderFulfillmentStatus>([SalesOrderFulfillmentStatus.PARTIALLY_RETURNED, SalesOrderFulfillmentStatus.CANCELLED, SalesOrderFulfillmentStatus.RETURNED]).has(order.fulfillmentStatus)) {
    throw new SalesConflictError('Restore the sales order before editing it');
  }
}

function assertNoFinancialLink(order: SalesOrderRecord): void {
  if (order.debtId || order.installmentPlanId) {
    throw new SalesConflictError('Unlink the financial record before changing order money or identity');
  }
  if (order.counterPayments?.length) throw new SalesConflictError('Receipted sale money/identity cannot be rewritten; a coherent correction workflow is required');
}

function activeStockLineConflict(): SalesConflictError {
  return new SalesConflictError(
    'Stock has already been deducted for this line. Restore the stock before editing or removing it. / تم إخراج المخزون لهذا السطر. أعد المخزون قبل تعديله أو حذفه.'
  );
}

function assertCanConvert(order: SalesOrderRecord): void {
  if (new Set<SalesOrderFulfillmentStatus>([SalesOrderFulfillmentStatus.PARTIALLY_RETURNED, SalesOrderFulfillmentStatus.CANCELLED, SalesOrderFulfillmentStatus.RETURNED]).has(order.fulfillmentStatus)) {
    throw new SalesConflictError('Final orders cannot be converted');
  }
  if (compareMoney(order.remainingAmount, '0.00') <= 0) throw new SalesConflictError('Sales order has no remaining balance');
  if (order.debtId || order.installmentPlanId) throw new SalesConflictError('Sales order already has a financial link');
}

async function requireAdminVerification(
  input: { accountPassword?: string; reason?: string },
  user: SalesMutationUser,
  context: SalesRequestContext,
  recordId: string,
  action: string,
  tx: Prisma.TransactionClient
) {
  if (user.role !== Role.ADMIN) assertSalesAdmin(user);
  if (!input.accountPassword) throw new ValidationError('Account password is required');
  if (!input.reason) throw new ValidationError('Reason is required');
  await verifyAdminPassword(user.userId, input.accountPassword, {
    action,
    recordType: 'SALES_ORDER',
    recordId,
    ipAddress: context.ipAddress,
    domainLabel: 'sales order changes',
  }, tx);
}

async function prepareItems(items: Array<{
  productId?: string | null;
  manualProductName?: string | null;
  manualProductModel?: string | null;
  quantity: number;
  unitPrice: string;
  discountAmount?: string | null;
  taxProfileId?: string | null;
  priceIncludesVat?: boolean;
  notes?: string | null;
}>, effectiveOn: Date, tx: Prisma.TransactionClient, currency: Currency = Currency.USD, rate: Prisma.Decimal = new Prisma.Decimal(1)): Promise<Prisma.SalesOrderItemUncheckedCreateWithoutSalesOrderInput[]> {
  return Promise.all(items.map(async (item) => {
    if (Boolean(item.productId) === Boolean(item.manualProductName)) {
      throw new ValidationError('Choose one existing product or enter a manual product name');
    }
    const product = item.productId ? await SalesOrdersRepository.findActiveProduct(item.productId, tx) : null;
    if (item.productId && !product) throw new NotFoundError('Product not found');
    if (product && product.priceCurrency !== currency) throw new ValidationError('Product and sale currencies must match');
    const profile = await TaxRepository.requireEffectiveProfile(
      product?.taxProfileId ?? item.taxProfileId,
      effectiveOn,
      tx
    );
    const vat = calculateVatLine({
      currency,
      quotedUnitPrice: item.unitPrice,
      quantity: item.quantity,
      discountAmount: item.discountAmount,
      priceIncludesVat: product?.priceIncludesVat ?? item.priceIncludesVat ?? true,
      taxRatePercent: profile.taxRate.ratePercent,
      taxCode: profile.code,
    });
    return {
      productId: product?.id ?? null,
      manualProductName: product ? null : item.manualProductName,
      manualProductModel: product ? null : item.manualProductModel ?? null,
      productNameSnapshot: product?.name ?? item.manualProductName!,
      productModelSnapshot: product?.model ?? item.manualProductModel ?? null,
      skuSnapshot: product?.sku ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount ?? null,
      lineTotal: vat.lineTotalExVat,
      baseUnitPrice: toBaseAmount(item.unitPrice, currency, rate, Prisma.Decimal.ROUND_HALF_UP),
      baseDiscountAmount: item.discountAmount == null ? null : toBaseAmount(item.discountAmount, currency, rate, Prisma.Decimal.ROUND_HALF_UP),
      baseLineTotal: toBaseAmount(vat.lineTotalExVat, currency, rate, Prisma.Decimal.ROUND_HALF_UP),
      taxRateSnapshot: vat.taxRateSnapshot,
      taxCodeSnapshot: vat.taxCodeSnapshot,
      unitPriceExVat: vat.unitPriceExVat,
      vatAmount: vat.vatAmount,
      lineTotalIncVat: vat.lineTotalIncVat,
      notes: item.notes ?? null,
    };
  }));
}

type DeliveryVatSnapshot = {
  deliveryFee: Prisma.Decimal | string | null;
  deliveryTaxTreatment: DeliveryTaxTreatment;
  deliveryTaxRateSnapshot: Prisma.Decimal | string;
  deliveryTaxCodeSnapshot: string | null;
  deliveryFeeExVat: Prisma.Decimal | string | null;
  deliveryVatAmount: Prisma.Decimal | string;
  deliveryFeeIncVat: Prisma.Decimal | string | null;
};

async function prepareDeliveryVat(
  feeInput: Prisma.Decimal | string | null | undefined,
  treatment: DeliveryTaxTreatment,
  taxProfileId: string | null | undefined,
  effectiveOn: Date,
  tx: Prisma.TransactionClient,
  currency: Currency = Currency.USD
): Promise<DeliveryVatSnapshot> {
  const hasFee = feeInput !== null && feeInput !== undefined;
  const fee = parseMoney(feeInput ?? ZERO_MONEY, currency);
  if (compareMoney(fee, ZERO_MONEY, currency) < 0) {
    throw new ValidationError('Delivery fee cannot be negative');
  }
  if (!hasFee || compareMoney(fee, ZERO_MONEY, currency) === 0) {
    return {
      deliveryFee: hasFee ? fee : null,
      deliveryTaxTreatment: treatment,
      deliveryTaxRateSnapshot: new Prisma.Decimal(0),
      deliveryTaxCodeSnapshot: treatment === DeliveryTaxTreatment.EXEMPT ? 'EXEMPT' : null,
      deliveryFeeExVat: hasFee ? fee : null,
      deliveryVatAmount: new Prisma.Decimal(0),
      deliveryFeeIncVat: hasFee ? fee : null,
    };
  }

  if (treatment === DeliveryTaxTreatment.EXEMPT) {
    if (taxProfileId) throw new ValidationError('Exempt delivery cannot use a tax profile');
    return deliveryVatResult(fee, treatment, '0.000', 'EXEMPT', currency);
  }

  const profile = taxProfileId
    ? await TaxRepository.requireEffectiveProfile(taxProfileId, effectiveOn, tx)
    : treatment === DeliveryTaxTreatment.ZERO_RATED
      ? await TaxRepository.requireEffectiveZeroRatedProfile(effectiveOn, tx)
      : await TaxRepository.requireEffectiveProfile(undefined, effectiveOn, tx);
  const isZeroRate = new Prisma.Decimal(profile.taxRate.ratePercent.toString()).equals(0);
  if (treatment === DeliveryTaxTreatment.ZERO_RATED && !isZeroRate) {
    throw new ValidationError('Zero-rated delivery requires a zero-rated tax profile');
  }
  if (treatment === DeliveryTaxTreatment.STANDARD && isZeroRate) {
    throw new ValidationError('Standard delivery requires a non-zero tax profile');
  }
  return deliveryVatResult(
    fee,
    treatment,
    profile.taxRate.ratePercent,
    profile.code, currency
  );
}

function deliveryVatResult(
  fee: Prisma.Decimal,
  treatment: DeliveryTaxTreatment,
  rate: Prisma.Decimal | string,
  taxCode: string,
  currency: Currency
): DeliveryVatSnapshot {
  const vat = calculateVatLine({
    currency: currency,
    quotedUnitPrice: fee,
    quantity: 1,
    priceIncludesVat: true,
    taxRatePercent: rate,
    taxCode,
  });
  return {
    deliveryFee: vat.lineTotalIncVat,
    deliveryTaxTreatment: treatment,
    deliveryTaxRateSnapshot: vat.taxRateSnapshot,
    deliveryTaxCodeSnapshot: vat.taxCodeSnapshot,
    deliveryFeeExVat: vat.lineTotalExVat,
    deliveryVatAmount: vat.vatAmount,
    deliveryFeeIncVat: vat.lineTotalIncVat,
  };
}

function deliverySnapshot(order: SalesOrderRecord): DeliveryVatSnapshot {
  return {
    deliveryFee: order.deliveryFee,
    deliveryTaxTreatment: order.deliveryTaxTreatment,
    deliveryTaxRateSnapshot: order.deliveryTaxRateSnapshot,
    deliveryTaxCodeSnapshot: order.deliveryTaxCodeSnapshot,
    deliveryFeeExVat: order.deliveryFeeExVat,
    deliveryVatAmount: order.deliveryVatAmount,
    deliveryFeeIncVat: order.deliveryFeeIncVat,
  };
}

function calculateVatAwareOrderTotals(
  items: Array<{
    lineTotal: { toString(): string };
    vatAmount?: { toString(): string };
    lineTotalIncVat?: { toString(): string };
  }>,
  delivery: DeliveryVatSnapshot,
  paidAmountInput?: Prisma.Decimal | string | null,
  currency: Currency = Currency.USD
) {
  if (!items.length) throw new ValidationError('At least one item is required');
  const itemsSubtotal = sumMoney(items.map((item) => item.lineTotal.toString()), currency);
  const itemsVatAmount = sumMoney(items.map((item) => (item.vatAmount ?? ZERO_MONEY).toString()), currency);
  const inclusiveItemsTotal = sumMoney(items.map((item) => (item.lineTotalIncVat ?? item.lineTotal).toString()), currency);
  const deliveryFeeExVat = parseMoney(delivery.deliveryFeeExVat ?? ZERO_MONEY, currency);
  const deliveryVatAmount = parseMoney(delivery.deliveryVatAmount, currency);
  const deliveryFeeIncVat = parseMoney(delivery.deliveryFeeIncVat ?? ZERO_MONEY, currency);
  const subtotalExVat = sumMoney([itemsSubtotal, deliveryFeeExVat], currency);
  const vatAmount = sumMoney([itemsVatAmount, deliveryVatAmount], currency);
  const totalAmount = sumMoney([inclusiveItemsTotal, deliveryFeeIncVat], currency);
  const paidAmount = parseMoney(paidAmountInput ?? '0.00', currency);
  if (compareMoney(paidAmount, ZERO_MONEY, currency) < 0) throw new ValidationError('Paid amount cannot be negative');
  if (compareMoney(paidAmount, totalAmount, currency) > 0) throw new ValidationError('Paid amount cannot exceed the order total');
  return {
    itemsSubtotal: moneyToApiString(itemsSubtotal, currency),
    subtotalExVat: moneyToApiString(subtotalExVat, currency),
    vatAmount: moneyToApiString(vatAmount, currency),
    deliveryFee: moneyToApiString(delivery.deliveryFeeIncVat ?? ZERO_MONEY, currency),
    totalAmount: moneyToApiString(totalAmount, currency),
    paidAmount: moneyToApiString(paidAmount, currency),
    remainingAmount: moneyToApiString(subtractMoney(totalAmount, paidAmount, currency), currency),
  };
}

async function auditMutation(
  order: SalesOrderRecord,
  mutation: {
    recordType?: SalesAuditRecordType;
    recordId?: string;
    action: SalesAuditAction;
    reason: string;
    beforeValues: Prisma.InputJsonObject;
    afterValues: Prisma.InputJsonObject;
  },
  user: SalesMutationUser,
  context: SalesRequestContext,
  tx: Prisma.TransactionClient
) {
  const actor = await SalesOrdersRepository.findActor(user.userId, tx);
  if (!actor) throw new NotFoundError('User not found');
  await writeSalesAudit({
    recordType: mutation.recordType ?? SalesAuditRecordType.SALES_ORDER,
    recordId: mutation.recordId ?? order.id,
    salesOrderId: order.id,
    action: mutation.action,
    changedById: user.userId,
    changedByName: actor.fullName,
    changedByUsername: actor.username,
    reason: mutation.reason,
    beforeValues: mutation.beforeValues,
    afterValues: mutation.afterValues,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
  }, tx);
}

function validateCreateDebtTerms(input: CreateSalesOrderInput, remainingAmount: string) {
  const hasRemainder = compareMoney(remainingAmount, '0.00') > 0;
  const isDraft = input.fulfillmentStatus === SalesOrderFulfillmentStatus.DRAFT;
  if (hasRemainder && !isDraft && !input.debtDueDate) throw new ValidationError('Debt due date is required when a balance remains');
  if (!hasRemainder && input.debtDueDate) throw new ValidationError('Debt due date is not allowed when the order is paid in full');
  if (input.debtDueDate) assertDateNotBefore(input.debtDueDate, input.orderDate, 'Debt due date cannot be before order date');
}

function validateMutationDebtTerms(
  order: SalesOrderRecord,
  remainingAmount: string,
  debtDueDate?: string | null
): boolean {
  const shouldCreateDebt =
    compareMoney(remainingAmount, '0.00') > 0 &&
    order.fulfillmentStatus !== SalesOrderFulfillmentStatus.DRAFT &&
    !order.debtId &&
    !order.installmentPlanId;
  if (shouldCreateDebt && !debtDueDate) {
    throw new ValidationError('Debt due date is required when a balance remains');
  }
  if (!shouldCreateDebt && debtDueDate) {
    throw new ValidationError('Debt due date is not allowed when no debt will be created');
  }
  if (debtDueDate) {
    assertDateNotBefore(
      debtDueDate,
      prismaDateToBusinessDate(order.orderDate),
      'Debt due date cannot be before order date'
    );
  }
  return shouldCreateDebt;
}

function validateCustomerRequirement(customerId: string | null | undefined, remainingAmount: string, allowFullyPaidWithoutCustomer = true) {
  if (!customerId && (compareMoney(remainingAmount, '0.00') > 0 || !allowFullyPaidWithoutCustomer)) {
    throw new ValidationError('Customer is required for this order');
  }
}

function requiredCustomerId(order: SalesOrderRecord): string {
  if (!order.customerId) throw new ValidationError('Customer is required before creating a financial record');
  return order.customerId;
}

function validateOrderDates(orderDate: string, deliveryDate?: string | null) {
  if (compareBusinessDates(orderDate, todayInBusinessTimezone()) > 0) throw new ValidationError('Order date cannot be in the future');
  if (deliveryDate) assertDateNotBefore(deliveryDate, orderDate, 'Delivery date cannot be before order date');
}

function assertDateNotBefore(value: string, minimum: string, message: string) {
  if (compareBusinessDates(value, minimum) < 0) throw new ValidationError(message);
}

function dateOrNull(value?: string | null): Date | null {
  return value ? businessDateToPrisma(value) : null;
}

function dateString(value?: Date | null): string | null {
  return value ? prismaDateToBusinessDate(value) : null;
}

function isOrderNumberCollision(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' &&
    Array.isArray(error.meta?.target) && error.meta.target.includes('orderNumber');
}

function changedValues(order: SalesOrderRecord, fields: string[]): Prisma.InputJsonObject {
  const serialized = serializeSalesOrder(order) as Record<string, unknown>;
  return Object.fromEntries(fields.map((field) => [field, serialized[field] ?? null])) as Prisma.InputJsonObject;
}

function orderSnapshot(order: SalesOrderRecord): Prisma.InputJsonObject {
  return {
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    salesChannel: order.salesChannel,
    orderDate: prismaDateToBusinessDate(order.orderDate),
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    settlement: order.settlement,
    currency: order.currency,
    exchangeRate: order.exchangeRate.toFixed(6),
    itemsSubtotal: moneyToApiString(order.itemsSubtotal, order.currency),
    deliveryFee: moneyToApiString(order.deliveryFee ?? ZERO_MONEY, order.currency),
    deliveryTaxTreatment: order.deliveryTaxTreatment,
    deliveryTaxRateSnapshot: order.deliveryTaxRateSnapshot.toFixed(3),
    deliveryTaxCodeSnapshot: order.deliveryTaxCodeSnapshot,
    deliveryFeeExVat: moneyToApiString(order.deliveryFeeExVat ?? ZERO_MONEY, order.currency),
    deliveryVatAmount: moneyToApiString(order.deliveryVatAmount, order.currency),
    deliveryFeeIncVat: moneyToApiString(order.deliveryFeeIncVat ?? ZERO_MONEY, order.currency),
    totalAmount: moneyToApiString(order.totalAmount, order.currency),
    paidAmount: moneyToApiString(order.paidAmount, order.currency),
    remainingAmount: moneyToApiString(order.remainingAmount, order.currency),
    debtId: order.debtId,
    installmentPlanId: order.installmentPlanId,
  };
}

function itemSnapshot(item: {
  id: string;
  productId: string | null;
  manualProductName: string | null;
  manualProductModel: string | null;
  quantity: number;
  unitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal | null;
  lineTotal: Prisma.Decimal;
  taxRateSnapshot?: Prisma.Decimal;
  taxCodeSnapshot?: string | null;
  unitPriceExVat?: Prisma.Decimal;
  vatAmount?: Prisma.Decimal;
  lineTotalIncVat?: Prisma.Decimal;
  notes: string | null;
}, currency: Currency = Currency.USD): Prisma.InputJsonObject {
  return {
    id: item.id,
    productId: item.productId,
    manualProductName: item.manualProductName,
    manualProductModel: item.manualProductModel,
    quantity: item.quantity,
    unitPrice: moneyToApiString(item.unitPrice, currency),
    discountAmount: moneyToApiString(item.discountAmount ?? '0.00', currency),
    lineTotal: moneyToApiString(item.lineTotal, currency),
    taxRateSnapshot: item.taxRateSnapshot?.toFixed(3) ?? '0.000',
    taxCodeSnapshot: item.taxCodeSnapshot ?? null,
    unitPriceExVat: moneyToApiString(item.unitPriceExVat ?? item.unitPrice, currency),
    vatAmount: moneyToApiString(item.vatAmount ?? ZERO_MONEY, currency),
    lineTotalIncVat: moneyToApiString(item.lineTotalIncVat ?? item.lineTotal, currency),
    notes: item.notes,
  };
}

function counterReceiptSnapshot(order: SalesOrderRecord): Prisma.InputJsonObject {
  const serialized = serializeSalesOrder(order);
  return {
    ...orderSnapshot(order), salesOrderId: order.id,
    subtotalExVat: serialized.subtotalExVat, vatAmount: serialized.vatAmount,
    baseSubtotal: serialized.baseSubtotal, baseDeliveryFee: serialized.baseDeliveryFee,
    baseTotalAmount: serialized.baseTotalAmount, basePaidAmount: serialized.basePaidAmount,
    baseRemainingAmount: serialized.baseRemainingAmount,
    items: order.items.map((item) => ({
      ...itemSnapshot(item, order.currency),
      productName: item.productNameSnapshot,
      productModel: item.productModelSnapshot,
      baseUnitPrice: moneyToApiString(item.baseUnitPrice),
      baseDiscountAmount: moneyToApiString(item.baseDiscountAmount ?? ZERO_MONEY),
      baseLineTotal: moneyToApiString(item.baseLineTotal),
    })),
  };
}

export function serializeSalesOrder(order: SalesOrderRecord) {
  const itemsVatAmount = sumMoney(order.items.map((item) => item.vatAmount ?? ZERO_MONEY));
  const vatAmount = sumMoney([itemsVatAmount, order.deliveryVatAmount]);
  const subtotalExVat = sumMoney([order.itemsSubtotal, order.deliveryFeeExVat ?? ZERO_MONEY]);
  return {
    ...order,
    orderDate: prismaDateToBusinessDate(order.orderDate),
    deliveryDate: dateString(order.deliveryDate),
    deliveredAt: dateString(order.deliveredAt),
    itemsSubtotal: moneyToApiString(order.itemsSubtotal, order.currency),
    subtotalExVat: moneyToApiString(subtotalExVat, order.currency),
    itemsVatAmount: moneyToApiString(itemsVatAmount, order.currency),
    deliveryFee: moneyToApiString(order.deliveryFee ?? '0.00', order.currency),
    deliveryTaxRateSnapshot: order.deliveryTaxRateSnapshot.toFixed(3),
    deliveryFeeExVat: moneyToApiString(order.deliveryFeeExVat ?? ZERO_MONEY, order.currency),
    deliveryVatAmount: moneyToApiString(order.deliveryVatAmount, order.currency),
    deliveryFeeIncVat: moneyToApiString(order.deliveryFeeIncVat ?? ZERO_MONEY, order.currency),
    totalAmount: moneyToApiString(order.totalAmount, order.currency),
    paidAmount: moneyToApiString(order.paidAmount, order.currency),
    remainingAmount: moneyToApiString(order.remainingAmount, order.currency),
    vatAmount: moneyToApiString(vatAmount, order.currency),
    exchangeRate: order.exchangeRate.toFixed(6),
    baseSubtotal: moneyToApiString(order.baseSubtotal),
    baseDeliveryFee: moneyToApiString(order.baseDeliveryFee ?? ZERO_MONEY),
    baseTotalAmount: moneyToApiString(order.baseTotalAmount),
    basePaidAmount: moneyToApiString(order.basePaidAmount),
    baseRemainingAmount: moneyToApiString(order.baseRemainingAmount),
    items: order.items.map((item) => {
      const stockFulfillments = item.stockFulfillments ?? [];
      const openingCount = item.product?.stockMovements?.[0] ?? null;
      const product = item.product ? serializeSalesOrderProduct(item.product) : null;
      return {
        ...item,
        returnedQuantity: (item.returnItems ?? []).reduce((total, returned) => total + returned.quantity, 0),
        remainingReturnableQuantity: item.quantity - (item.returnItems ?? []).reduce((total, returned) => total + returned.quantity, 0),
        unitPrice: moneyToApiString(item.unitPrice, order.currency),
        discountAmount: moneyToApiString(item.discountAmount ?? '0.00', order.currency),
        lineTotal: moneyToApiString(item.lineTotal, order.currency),
        taxRateSnapshot: item.taxRateSnapshot?.toFixed(3) ?? '0.000',
        unitPriceExVat: moneyToApiString(item.unitPriceExVat ?? item.unitPrice, order.currency),
        vatAmount: moneyToApiString(item.vatAmount ?? ZERO_MONEY, order.currency),
        lineTotalIncVat: moneyToApiString(item.lineTotalIncVat ?? item.lineTotal, order.currency),
        product,
        stockFulfillments,
        inventory: salesOrderItemInventoryState(order, item, openingCount?.createdAt ?? null, stockFulfillments),
      };
    }),
    debt: order.debt ? {
      ...order.debt,
      originalAmount: moneyToApiString(order.debt.originalAmount, order.currency),
      dueDate: prismaDateToBusinessDate(order.debt.dueDate),
    } : null,
    installmentPlan: order.installmentPlan ? {
      ...order.installmentPlan,
      totalAmount: moneyToApiString(order.installmentPlan.totalAmount, order.currency),
      startDate: prismaDateToBusinessDate(order.installmentPlan.startDate),
    } : null,
    returns: (order.returns ?? []).map((salesReturn) => ({
      ...salesReturn,
      returnDate: prismaDateToBusinessDate(salesReturn.returnDate),
      totalIncVat: moneyToApiString(salesReturn.totalIncVat, order.currency),
      documentRoute: `/sales-returns/${salesReturn.id}`,
    })),
  };
}

function serializeSalesOrderProduct(product: NonNullable<SalesOrderRecord['items'][number]['product']>) {
  return {
    id: product.id,
    name: product.name,
    model: product.model,
    sku: product.sku,
    barcode: product.barcode,
    isActive: product.isActive,
    trackStock: product.trackStock,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    costPrice: product.costPrice ? moneyToApiString(product.costPrice) : null,
  };
}

function salesOrderItemInventoryState(
  order: Pick<SalesOrderRecord, 'orderDate' | 'fulfillmentStatus'>,
  item: SalesOrderRecord['items'][number],
  openingCreatedAt: Date | null,
  stockFulfillments: SalesOrderRecord['items'][number]['stockFulfillments']
) {
  const activeFulfillment = stockFulfillments.find(
    (entry) => entry.status === SalesOrderStockFulfillmentStatus.ACTIVE
  ) ?? null;
  const hasReversedFulfillment = stockFulfillments.some(
    (entry) => entry.status === SalesOrderStockFulfillmentStatus.REVERSED
  );
  let state:
    | 'NOT_INVENTORY_LINE'
    | 'STOCK_NOT_TRACKED'
    | 'NEEDS_OPENING_COUNT'
    | 'PREDATES_OPENING_COUNT'
    | 'ORDER_NOT_ELIGIBLE'
    | 'INSUFFICIENT_STOCK'
    | 'ALREADY_DEDUCTED'
    | 'RESTORED'
    | 'AVAILABLE';

  if (!item.productId || !item.product) state = 'NOT_INVENTORY_LINE';
  else if (!item.product.trackStock) state = 'STOCK_NOT_TRACKED';
  else if (!openingCreatedAt) state = 'NEEDS_OPENING_COUNT';
  else if (compareBusinessDates(
    prismaDateToBusinessDate(order.orderDate),
    timestampToBusinessDate(getBusinessTimezone(), openingCreatedAt)
  ) < 0) state = 'PREDATES_OPENING_COUNT';
  else if (!INVENTORY_DEDUCTIBLE_STATUSES.has(order.fulfillmentStatus)) state = 'ORDER_NOT_ELIGIBLE';
  else if (activeFulfillment) state = 'ALREADY_DEDUCTED';
  else if (item.product.stockQuantity < item.quantity) state = 'INSUFFICIENT_STOCK';
  else if (hasReversedFulfillment) state = 'RESTORED';
  else state = 'AVAILABLE';

  return { state, activeFulfillmentId: activeFulfillment?.id ?? null };
}


function creditOverrideInput(input: import('../../financial/credit-limits/credit-limit.service').CreditLimitOverrideInput) {
  return input.overrideCreditLimit ? { overrideCreditLimit: true, creditLimitOverrideReason: input.creditLimitOverrideReason, accountPassword: input.accountPassword } : {};
}
