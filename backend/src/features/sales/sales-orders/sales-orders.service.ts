import {
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
import { compareMoney, moneyToApiString } from '../../financial/domain/money';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { DebtsService } from '../../financial/debts/debts.service';
import { InstallmentPlansService } from '../../financial/installment-plans/installment-plans.service';
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
import {
  calculateSalesOrderLineTotal,
  calculateSalesOrderTotals,
  deriveSalesOrderPaymentStatus,
} from '../domain/sales-order-totals';
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
    const totals = calculateSalesOrderTotals(input);
    const paymentStatus = deriveSalesOrderPaymentStatus(totals.paidAmount, totals.totalAmount);
    validateCustomerRequirement(input.customerId, totals.remainingAmount, user.role === Role.ADMIN);
    validateCreateDebtTerms(input, totals.remainingAmount);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await runFinancialTransaction(async (tx) => {
          if (input.customerId && !(await SalesOrdersRepository.findActiveCustomer(input.customerId, tx))) {
            throw new NotFoundError('Customer not found');
          }
          const preparedItems = await prepareItems(input.items, tx);
          const orderNumber = await SalesOrdersRepository.nextOrderNumber(Number(input.orderDate.slice(0, 4)), tx);
          const created = await SalesOrdersRepository.create({
            orderNumber,
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
            deliveryFee: input.deliveryFee ?? null,
            totalAmount: totals.totalAmount,
            paidAmount: totals.paidAmount,
            remainingAmount: totals.remainingAmount,
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
              }, user, context, tx)
            : created;

          await auditMutation(finalOrder, {
            action: SalesAuditAction.CREATE,
            reason: 'Sales order created',
            beforeValues: {},
            afterValues: orderSnapshot(finalOrder),
          }, user, context, tx);
          return serializeSalesOrder(finalOrder);
        });
      } catch (error) {
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
    return {
      periodSales: moneyToApiString(result.todayAggregate._sum.totalAmount ?? '0.00'),
      periodOrders: result.todayAggregate._count._all,
      pendingDelivery: result.pendingDelivery,
      unpaidOrders: result.unpaidOrders,
      partialPayments: result.partialPayments,
    };
  }

  static async update(id: string, input: UpdateSalesOrderInput, user: SalesMutationUser, context: SalesRequestContext) {
    const fields = Object.keys(input).filter((field) => !['reason', 'accountPassword', 'debtDueDate'].includes(field));
    if (!fields.length) throw new ValidationError('At least one sales order field is required');
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredOrder(id, tx);
      assertEditable(existing);
      const moneyOrIdentityChange = fields.some((field) => ['customerId', 'orderDate', 'deliveryFee'].includes(field));
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
      const deliveryFee = input.deliveryFee === undefined ? moneyToApiString(existing.deliveryFee ?? '0.00') : input.deliveryFee ?? '0.00';
      validateOrderDates(orderDate, deliveryDate);
      if (channel === SalesChannel.SHOP_DIRECT && (deliveryDate || compareMoney(deliveryFee, '0.00') !== 0)) {
        throw new ValidationError('Shop-direct orders cannot contain delivery date or fee');
      }
      let updated = await SalesOrdersRepository.update(id, {
        ...(input.customerId !== undefined ? { customerId } : {}),
        ...(input.salesChannel !== undefined ? { salesChannel: channel } : {}),
        ...(input.orderDate !== undefined ? { orderDate: businessDateToPrisma(orderDate) } : {}),
        ...(input.deliveryDate !== undefined ? { deliveryDate: dateOrNull(deliveryDate) } : {}),
        ...(input.deliveryFee !== undefined ? { deliveryFee: input.deliveryFee ?? null } : {}),
        ...(input.deliveryAddressSnapshot !== undefined ? { deliveryAddressSnapshot: input.deliveryAddressSnapshot } : {}),
        ...(input.deliveryNotes !== undefined ? { deliveryNotes: input.deliveryNotes } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedById: user.userId,
      }, tx);
      if (moneyOrIdentityChange) {
        updated = await this.recalculateOrder(id, input.debtDueDate, user, context, tx);
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
      const prepared = (await prepareItems([input], tx))[0];
      const item = await SalesOrdersRepository.addItem({ salesOrderId: id, ...prepared }, tx);
      const updated = await this.recalculateOrder(id, input.debtDueDate, user, context, tx);
      await auditMutation(updated, {
        recordType: SalesAuditRecordType.SALES_ORDER_ITEM,
        recordId: item.id,
        action: SalesAuditAction.ADD_ITEM,
        reason: input.reason ?? 'Sales order item added',
        beforeValues: {},
        afterValues: itemSnapshot(item),
      }, user, context, tx);
      return serializeSalesOrder(updated);
    });
  }

  static async updateItem(orderId: string, itemId: string, input: UpdateSalesOrderItemInput, user: SalesMutationUser, context: SalesRequestContext) {
    const fields = Object.keys(input).filter((field) => !['reason', 'accountPassword'].includes(field));
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
        unitPrice: input.unitPrice ?? moneyToApiString(item.unitPrice),
        discountAmount: input.discountAmount === undefined ? moneyToApiString(item.discountAmount ?? '0.00') : input.discountAmount,
        notes: input.notes === undefined ? item.notes : input.notes,
      };
      const prepared = (await prepareItems([merged], tx))[0];
      const changedItem = await SalesOrdersRepository.updateItem(itemId, prepared, tx);
      const updated = await this.recalculateOrder(orderId, input.debtDueDate, user, context, tx);
      await auditMutation(updated, {
        recordType: SalesAuditRecordType.SALES_ORDER_ITEM,
        recordId: itemId,
        action: SalesAuditAction.UPDATE_ITEM,
        reason: input.reason ?? 'Sales order item updated',
        beforeValues: itemSnapshot(item),
        afterValues: itemSnapshot(changedItem),
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
      const updated = await this.recalculateOrder(orderId, input.debtDueDate, user, context, tx);
      await auditMutation(updated, {
        recordType: SalesAuditRecordType.SALES_ORDER_ITEM,
        recordId: itemId,
        action: SalesAuditAction.REMOVE_ITEM,
        reason: input.reason ?? 'Sales order item removed',
        beforeValues: itemSnapshot(item),
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
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredOrder(id, tx);
      assertEditable(existing);
      assertNoFinancialLink(existing);
      await requireAdminVerification(input, user, context, id, 'CHANGE_SALES_ORDER_PAYMENT', tx);
      const totals = calculateSalesOrderTotals({
        items: existing.items.map((item) => ({ quantity: item.quantity, unitPrice: moneyToApiString(item.unitPrice), discountAmount: moneyToApiString(item.discountAmount ?? '0.00') })),
        deliveryFee: moneyToApiString(existing.deliveryFee ?? '0.00'),
        paidAmount: input.paidAmount,
      });
      validateCustomerRequirement(existing.customerId, totals.remainingAmount);
      const shouldCreateDebt = validateMutationDebtTerms(existing, totals.remainingAmount, input.debtDueDate);
      let updated = await SalesOrdersRepository.update(id, {
        paidAmount: totals.paidAmount,
        remainingAmount: totals.remainingAmount,
        paymentStatus: deriveSalesOrderPaymentStatus(totals.paidAmount, totals.totalAmount),
        updatedById: user.userId,
      }, tx);
      if (shouldCreateDebt) {
        updated = await this.createAndLinkDebt(updated, { dueDate: input.debtDueDate!, description: `Sales order ${updated.orderNumber}`, notes: null }, user, context, tx);
      }
      await auditMutation(updated, {
        action: SalesAuditAction.CHANGE_PAYMENT,
        reason: input.reason,
        beforeValues: { paidAmount: moneyToApiString(existing.paidAmount), remainingAmount: moneyToApiString(existing.remainingAmount), paymentStatus: existing.paymentStatus },
        afterValues: { paidAmount: totals.paidAmount, remainingAmount: totals.remainingAmount, paymentStatus: updated.paymentStatus },
      }, user, context, tx);
      return serializeSalesOrder(updated);
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
      amount: moneyToApiString(existing.remainingAmount),
      description: input.description ?? `Sales order ${existing.orderNumber}`,
      dueDate: input.dueDate,
      notes: input.notes ?? null,
    }, user, tx);
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
    tx: Prisma.TransactionClient
  ) {
    const order = await requiredOrder(id, tx);
    const totals = calculateSalesOrderTotals({
      items: order.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: moneyToApiString(item.unitPrice),
        discountAmount: moneyToApiString(item.discountAmount ?? '0.00'),
      })),
      deliveryFee: moneyToApiString(order.deliveryFee ?? '0.00'),
      paidAmount: moneyToApiString(order.paidAmount),
    });
    validateCustomerRequirement(order.customerId, totals.remainingAmount);
    const shouldCreateDebt = validateMutationDebtTerms(order, totals.remainingAmount, debtDueDate);
    let updated = await SalesOrdersRepository.update(id, {
      itemsSubtotal: totals.itemsSubtotal,
      totalAmount: totals.totalAmount,
      remainingAmount: totals.remainingAmount,
      paymentStatus: deriveSalesOrderPaymentStatus(totals.paidAmount, totals.totalAmount),
      updatedById: user.userId,
    }, tx);
    if (shouldCreateDebt) {
      updated = await this.createAndLinkDebt(updated, {
        dueDate: debtDueDate!,
        description: `Sales order ${updated.orderNumber}`,
        notes: null,
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
  if (order.fulfillmentStatus === SalesOrderFulfillmentStatus.CANCELLED || order.fulfillmentStatus === SalesOrderFulfillmentStatus.RETURNED) {
    throw new SalesConflictError('Restore the sales order before editing it');
  }
}

function assertNoFinancialLink(order: SalesOrderRecord): void {
  if (order.debtId || order.installmentPlanId) {
    throw new SalesConflictError('Unlink the financial record before changing order money or identity');
  }
}

function activeStockLineConflict(): SalesConflictError {
  return new SalesConflictError(
    'Stock has already been deducted for this line. Restore the stock before editing or removing it. / تم إخراج المخزون لهذا السطر. أعد المخزون قبل تعديله أو حذفه.'
  );
}

function assertCanConvert(order: SalesOrderRecord): void {
  if (order.fulfillmentStatus === SalesOrderFulfillmentStatus.CANCELLED || order.fulfillmentStatus === SalesOrderFulfillmentStatus.RETURNED) {
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
  notes?: string | null;
}>, tx: Prisma.TransactionClient): Promise<Prisma.SalesOrderItemUncheckedCreateWithoutSalesOrderInput[]> {
  return Promise.all(items.map(async (item) => {
    if (Boolean(item.productId) === Boolean(item.manualProductName)) {
      throw new ValidationError('Choose one existing product or enter a manual product name');
    }
    const product = item.productId ? await SalesOrdersRepository.findActiveProduct(item.productId, tx) : null;
    if (item.productId && !product) throw new NotFoundError('Product not found');
    const lineTotal = calculateSalesOrderLineTotal(item);
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
      lineTotal,
      notes: item.notes ?? null,
    };
  }));
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
    itemsSubtotal: moneyToApiString(order.itemsSubtotal),
    totalAmount: moneyToApiString(order.totalAmount),
    paidAmount: moneyToApiString(order.paidAmount),
    remainingAmount: moneyToApiString(order.remainingAmount),
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
  notes: string | null;
}): Prisma.InputJsonObject {
  return {
    id: item.id,
    productId: item.productId,
    manualProductName: item.manualProductName,
    manualProductModel: item.manualProductModel,
    quantity: item.quantity,
    unitPrice: moneyToApiString(item.unitPrice),
    discountAmount: moneyToApiString(item.discountAmount ?? '0.00'),
    lineTotal: moneyToApiString(item.lineTotal),
    notes: item.notes,
  };
}

export function serializeSalesOrder(order: SalesOrderRecord) {
  return {
    ...order,
    orderDate: prismaDateToBusinessDate(order.orderDate),
    deliveryDate: dateString(order.deliveryDate),
    deliveredAt: dateString(order.deliveredAt),
    itemsSubtotal: moneyToApiString(order.itemsSubtotal),
    deliveryFee: moneyToApiString(order.deliveryFee ?? '0.00'),
    totalAmount: moneyToApiString(order.totalAmount),
    paidAmount: moneyToApiString(order.paidAmount),
    remainingAmount: moneyToApiString(order.remainingAmount),
    items: order.items.map((item) => {
      const stockFulfillments = item.stockFulfillments ?? [];
      const openingCount = item.product?.stockMovements?.[0] ?? null;
      const product = item.product ? serializeSalesOrderProduct(item.product) : null;
      return {
        ...item,
        unitPrice: moneyToApiString(item.unitPrice),
        discountAmount: moneyToApiString(item.discountAmount ?? '0.00'),
        lineTotal: moneyToApiString(item.lineTotal),
        product,
        stockFulfillments,
        inventory: salesOrderItemInventoryState(order, item, openingCount?.createdAt ?? null, stockFulfillments),
      };
    }),
    debt: order.debt ? {
      ...order.debt,
      originalAmount: moneyToApiString(order.debt.originalAmount),
      dueDate: prismaDateToBusinessDate(order.debt.dueDate),
    } : null,
    installmentPlan: order.installmentPlan ? {
      ...order.installmentPlan,
      totalAmount: moneyToApiString(order.installmentPlan.totalAmount),
      startDate: prismaDateToBusinessDate(order.installmentPlan.startDate),
    } : null,
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
