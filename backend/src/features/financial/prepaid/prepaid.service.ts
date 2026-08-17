import {
  DebtKind,
  DebtStatus,
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  FinancialCorrectionSourceScreen,
  PrepaidPurchaseStatus,
} from '@prisma/client';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import {
  assertPositiveMoney,
  businessDateToPrisma,
  calculateDebtBalance,
  calculatePrepaidAdminDebt,
  calculatePrepaidRemainingToCollect,
  determineDebtStatus,
  isPaymentAllocationVoided,
  isPrepaidAdminDebtActive,
  moneyToApiString,
  parseBusinessDate,
  PrepaidNotDeliveredError,
  PrepaidNotPendingError,
  PrepaidRemainderHasPaymentsError,
  prismaDateToBusinessDate,
  runFinancialTransaction,
  subtractMoney,
  sumMoney,
  todayInBusinessTimezone,
  ZERO_MONEY,
} from '../index';
import { DebtsRepository } from '../debts/debts.repository';
import { verifyAdminPasswordForCorrection } from '../authorization/account-password';
import { writeFinancialCorrectionAudit } from '../corrections/correction-audit';
import { PrepaidRepository, PrepaidPurchaseWithDetails } from './prepaid.repository';
import {
  DeliverPrepaidInput,
  PrepaidListQueryInput,
  RevertPrepaidDeliveryInput,
} from './prepaid.validator';
import {
  PrepaidPaymentView,
  PrepaidPurchaseListResult,
  PrepaidPurchaseSummary,
  PrepaidPurchaseView,
} from './prepaid.types';

interface AuthenticatedUser {
  userId: string;
  role: string;
}

export interface PrepaidRequestContext {
  requestId?: string | null;
  ipAddress?: string | null;
}

const DEFAULT_DELIVERY_REASON = 'Item delivered to customer';

export class PrepaidService {
  static async listPrepaidPurchases(
    query: PrepaidListQueryInput
  ): Promise<PrepaidPurchaseListResult> {
    const where = PrepaidRepository.buildWhere({
      status: query.status,
      customerId: query.customerId,
      search: query.search,
      dateFrom: query.dateFrom ? businessDateToPrisma(parseBusinessDate(query.dateFrom)) : undefined,
      dateTo: query.dateTo ? businessDateToPrisma(parseBusinessDate(query.dateTo)) : undefined,
    });

    // Totals are computed over every matching row, never over the page slice.
    const summaryRows = await PrepaidRepository.findAllForSummary(where);
    const summaryViews = summaryRows
      .map((row) => this.toView(row))
      .filter((view) => (query.fullyPaidOnly ? view.isFullyPaid : true));

    const summary = this.buildSummary(summaryViews);

    // `fullyPaidOnly` and `adminDebt` sorting are derived values, so those pages
    // are sliced from the computed set rather than by the database.
    if (query.fullyPaidOnly || query.sortBy === 'adminDebt') {
      const sorted = this.sortViews(summaryViews, query.sortBy, query.sortOrder);
      const start = (query.page - 1) * query.pageSize;
      return {
        summary,
        items: sorted.slice(start, start + query.pageSize),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: sorted.length,
          totalPages: Math.ceil(sorted.length / query.pageSize),
        },
      };
    }

    const orderBy =
      query.sortBy === 'customerName'
        ? [{ debt: { customer: { name: query.sortOrder } } }]
        : [{ createdAt: query.sortOrder }];

    const { items, total } = await PrepaidRepository.list({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy,
    });

    return {
      summary,
      items: items.map((item) => this.toView(item)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  static async getPrepaidPurchase(id: string): Promise<PrepaidPurchaseView> {
    const prepaid = await PrepaidRepository.findById(id);
    if (!prepaid) {
      throw new NotFoundError('Prepaid purchase not found');
    }
    return this.toView(prepaid);
  }

  static async deliver(
    id: string,
    input: DeliverPrepaidInput,
    user: AuthenticatedUser,
    context: PrepaidRequestContext = {}
  ): Promise<PrepaidPurchaseView> {
    const actor = await DebtsRepository.findUserIdentity(user.userId);
    if (!actor) {
      throw new NotFoundError('Acting user not found');
    }
    const businessDate = todayInBusinessTimezone();

    return runFinancialTransaction(async (tx) => {
      const prepaid = await PrepaidRepository.findById(id, tx);
      if (!prepaid) {
        throw new NotFoundError('Prepaid purchase not found');
      }
      if (prepaid.status !== PrepaidPurchaseStatus.PENDING) {
        throw new PrepaidNotPendingError(
          prepaid.status === PrepaidPurchaseStatus.DELIVERED
            ? 'Prepaid purchase is already delivered'
            : 'Prepaid purchase is cancelled'
        );
      }
      if (prepaid.debt.cancelledAt || prepaid.debt.status === DebtStatus.CANCELLED) {
        throw new PrepaidNotPendingError('Prepaid purchase is cancelled');
      }

      const balance = this.balanceOf(prepaid);
      const remaining = calculatePrepaidRemainingToCollect({
        fullAmount: prepaid.debt.originalAmount,
        totalPaid: balance.totalPaid,
      });
      const adminDebtBefore = calculatePrepaidAdminDebt({
        kind: prepaid.debt.kind,
        prepaidStatus: prepaid.status,
        isCancelled: false,
        totalPaid: balance.totalPaid,
      });

      let remainderDebtId: string | null = null;
      if (remaining.greaterThan(ZERO_MONEY)) {
        if (!input.remainderDueDate) {
          throw new ValidationError(
            'A due date is required for the remaining balance because this item is not fully paid'
          );
        }
        const remainderDueDate = parseBusinessDate(input.remainderDueDate);
        const remainderAmount = assertPositiveMoney(remaining);

        const remainderDebt = await DebtsRepository.createDebt(
          {
            customerId: prepaid.debt.customerId,
            description: `Balance for ${prepaid.debt.description}`,
            kind: DebtKind.STANDARD,
            originalAmount: remainderAmount,
            dueDate: businessDateToPrisma(remainderDueDate),
            status: determineDebtStatus({
              isCancelled: false,
              dueDate: remainderDueDate,
              businessDate,
              balance: calculateDebtBalance({
                originalAmount: remainderAmount,
                allocations: [],
              }),
              overdueEligible: true,
            }),
            notes: null,
            createdById: user.userId,
          },
          tx
        );
        remainderDebtId = remainderDebt.id;
      }

      const delivered = await PrepaidRepository.markDelivered(tx, id, {
        deliveredAt: businessDateToPrisma(businessDate),
        deliveredById: user.userId,
        deliveryNotes: input.deliveryNotes ?? null,
        remainderDebtId,
      });

      await writeFinancialCorrectionAudit(
        {
          recordType: FinancialCorrectionRecordType.PREPAID_PURCHASE,
          recordId: prepaid.id,
          customerId: prepaid.debt.customerId,
          action: FinancialCorrectionAction.DELIVER_PREPAID,
          correctedById: actor.id,
          correctedByName: actor.fullName,
          correctedByUsername: actor.username,
          reason: input.deliveryNotes?.trim() || DEFAULT_DELIVERY_REASON,
          beforeValues: this.toAuditValues(prepaid),
          afterValues: this.toAuditValues(delivered),
          affectedTotals: {
            adminDebtBefore: moneyToApiString(adminDebtBefore),
            adminDebtAfter: moneyToApiString(ZERO_MONEY),
            remainderDebtAmount: moneyToApiString(remaining),
            remainderDebtId,
          },
          sourceScreen: FinancialCorrectionSourceScreen.PREPAID,
          requestId: context.requestId ?? null,
          ipAddress: context.ipAddress ?? null,
        },
        tx
      );

      return this.toView(delivered);
    });
  }

  static async revertDelivery(
    id: string,
    input: RevertPrepaidDeliveryInput,
    user: AuthenticatedUser,
    context: PrepaidRequestContext = {}
  ): Promise<PrepaidPurchaseView> {
    const actor = await DebtsRepository.findUserIdentity(user.userId);
    if (!actor) {
      throw new NotFoundError('Acting user not found');
    }

    await verifyAdminPasswordForCorrection(user.userId, input.accountPassword, {
      action: 'REVERT_PREPAID_DELIVERY',
      recordType: FinancialCorrectionRecordType.PREPAID_PURCHASE,
      recordId: id,
      ipAddress: context.ipAddress ?? null,
    });

    return runFinancialTransaction(async (tx) => {
      const prepaid = await PrepaidRepository.findById(id, tx);
      if (!prepaid) {
        throw new NotFoundError('Prepaid purchase not found');
      }
      if (prepaid.status !== PrepaidPurchaseStatus.DELIVERED) {
        throw new PrepaidNotDeliveredError();
      }

      if (prepaid.remainderDebtId) {
        const remainderDebt = await PrepaidRepository.findDebtForRemainder(
          prepaid.remainderDebtId,
          tx
        );
        if (remainderDebt) {
          const hasPayments = remainderDebt.paymentAllocations.some(
            (allocation) => !isPaymentAllocationVoided(allocation)
          );
          if (hasPayments) {
            throw new PrepaidRemainderHasPaymentsError();
          }
          if (remainderDebt.status !== DebtStatus.CANCELLED) {
            // Cancel rather than delete: the debt stays visible in history.
            await DebtsRepository.cancelDebt(tx, remainderDebt.id, {
              cancelledAt: new Date(),
              cancelledById: user.userId,
              cancelReason: `Delivery reverted: ${input.reason}`,
            });
          }
        }
      }

      const reverted = await PrepaidRepository.revertDelivery(tx, id);
      const balance = this.balanceOf(reverted);
      const adminDebtAfter = calculatePrepaidAdminDebt({
        kind: reverted.debt.kind,
        prepaidStatus: reverted.status,
        isCancelled: false,
        totalPaid: balance.totalPaid,
      });

      await writeFinancialCorrectionAudit(
        {
          recordType: FinancialCorrectionRecordType.PREPAID_PURCHASE,
          recordId: prepaid.id,
          customerId: prepaid.debt.customerId,
          action: FinancialCorrectionAction.REVERT_PREPAID_DELIVERY,
          correctedById: actor.id,
          correctedByName: actor.fullName,
          correctedByUsername: actor.username,
          reason: input.reason,
          beforeValues: this.toAuditValues(prepaid),
          afterValues: this.toAuditValues(reverted),
          affectedTotals: {
            adminDebtBefore: moneyToApiString(ZERO_MONEY),
            adminDebtAfter: moneyToApiString(adminDebtAfter),
            cancelledRemainderDebtId: prepaid.remainderDebtId,
          },
          sourceScreen: FinancialCorrectionSourceScreen.PREPAID,
          requestId: context.requestId ?? null,
          ipAddress: context.ipAddress ?? null,
        },
        tx
      );

      return this.toView(reverted);
    });
  }

  private static balanceOf(prepaid: PrepaidPurchaseWithDetails) {
    return calculateDebtBalance({
      originalAmount: prepaid.debt.originalAmount,
      allocations: prepaid.debt.paymentAllocations.map((allocation) => ({
        amount: allocation.amount,
        isVoided: isPaymentAllocationVoided(allocation),
      })),
    });
  }

  private static effectiveStatus(prepaid: PrepaidPurchaseWithDetails): PrepaidPurchaseStatus {
    if (prepaid.debt.cancelledAt || prepaid.debt.status === DebtStatus.CANCELLED) {
      return PrepaidPurchaseStatus.CANCELLED;
    }
    return prepaid.status;
  }

  /**
   * The individual bills paid towards this item, oldest first. Adding a bill
   * appends to this list; nothing here is ever rewritten or replaced.
   */
  private static paymentsOf(prepaid: PrepaidPurchaseWithDetails): PrepaidPaymentView[] {
    return prepaid.debt.paymentAllocations
      .map((allocation): PrepaidPaymentView => ({
        id: allocation.id,
        paymentId: allocation.paymentId,
        amount: moneyToApiString(allocation.amount),
        paymentDate: prismaDateToBusinessDate(allocation.payment.paymentDate),
        paymentMethod: allocation.payment.paymentMethod,
        reference: allocation.payment.reference,
        notes: allocation.payment.notes,
        recordedBy: allocation.payment.createdBy
          ? {
              id: allocation.payment.createdBy.id,
              name: allocation.payment.createdBy.fullName,
              username: allocation.payment.createdBy.username,
            }
          : null,
        isVoided: isPaymentAllocationVoided(allocation),
        createdAt: allocation.createdAt.toISOString(),
      }))
      .sort((left, right) => {
        const byDate = left.paymentDate.localeCompare(right.paymentDate);
        if (byDate !== 0) return byDate;
        const byCreated = left.createdAt.localeCompare(right.createdAt);
        return byCreated === 0 ? left.id.localeCompare(right.id) : byCreated;
      });
  }

  private static toView(prepaid: PrepaidPurchaseWithDetails): PrepaidPurchaseView {
    const balance = this.balanceOf(prepaid);
    const payments = this.paymentsOf(prepaid);
    const status = this.effectiveStatus(prepaid);
    const remainingToCollect = calculatePrepaidRemainingToCollect({
      fullAmount: prepaid.debt.originalAmount,
      totalPaid: balance.totalPaid,
    });
    const adminDebt = calculatePrepaidAdminDebt({
      kind: prepaid.debt.kind,
      prepaidStatus: status,
      isCancelled: status === PrepaidPurchaseStatus.CANCELLED,
      totalPaid: balance.totalPaid,
    });

    return {
      id: prepaid.id,
      debtId: prepaid.debtId,
      customer: prepaid.debt.customer,
      itemName: prepaid.debt.description,
      fullAmount: moneyToApiString(prepaid.debt.originalAmount),
      amountPaid: moneyToApiString(balance.totalPaid),
      adminDebt: moneyToApiString(adminDebt),
      remainingToCollect: moneyToApiString(remainingToCollect),
      dueDate: prismaDateToBusinessDate(prepaid.debt.dueDate),
      isFullyPaid: remainingToCollect.isZero(),
      status,
      notes: prepaid.debt.notes,
      deliveredAt: prepaid.deliveredAt ? prismaDateToBusinessDate(prepaid.deliveredAt) : null,
      deliveryNotes: prepaid.deliveryNotes,
      deliveredBy: prepaid.deliveredBy
        ? {
            id: prepaid.deliveredBy.id,
            name: prepaid.deliveredBy.fullName,
            username: prepaid.deliveredBy.username,
          }
        : null,
      remainderDebtId: prepaid.remainderDebtId,
      createdBy: prepaid.debt.createdBy
        ? {
            id: prepaid.debt.createdBy.id,
            name: prepaid.debt.createdBy.fullName,
            username: prepaid.debt.createdBy.username,
          }
        : null,
      payments,
      paymentCount: payments.filter((payment) => !payment.isVoided).length,
      createdAt: prepaid.createdAt.toISOString(),
      updatedAt: prepaid.updatedAt.toISOString(),
    };
  }

  private static sortViews(
    views: PrepaidPurchaseView[],
    sortBy: PrepaidListQueryInput['sortBy'],
    sortOrder: PrepaidListQueryInput['sortOrder']
  ): PrepaidPurchaseView[] {
    const direction = sortOrder === 'asc' ? 1 : -1;
    return [...views].sort((left, right) => {
      let comparison = 0;
      if (sortBy === 'customerName') {
        comparison = left.customer.name.localeCompare(right.customer.name);
      } else if (sortBy === 'adminDebt') {
        comparison = Number(left.adminDebt) - Number(right.adminDebt);
      } else {
        comparison = left.createdAt.localeCompare(right.createdAt);
      }
      return comparison === 0 ? left.id.localeCompare(right.id) : comparison * direction;
    });
  }

  private static buildSummary(views: PrepaidPurchaseView[]): PrepaidPurchaseSummary {
    const awaitingDelivery = views.filter((view) =>
      isPrepaidAdminDebtActive({
        kind: DebtKind.PREPAID_PURCHASE,
        prepaidStatus: view.status,
        isCancelled: view.status === PrepaidPurchaseStatus.CANCELLED,
      })
    );

    return {
      totalAdminDebt: moneyToApiString(
        subtractMoney(ZERO_MONEY, sumMoney(awaitingDelivery.map((view) => view.amountPaid)))
      ),
      totalFullAmount: moneyToApiString(
        sumMoney(awaitingDelivery.map((view) => view.fullAmount))
      ),
      totalRemainingToCollect: moneyToApiString(
        sumMoney(awaitingDelivery.map((view) => view.remainingToCollect))
      ),
      pendingCount: views.filter((view) => view.status === PrepaidPurchaseStatus.PENDING).length,
      deliveredCount: views.filter((view) => view.status === PrepaidPurchaseStatus.DELIVERED).length,
      cancelledCount: views.filter((view) => view.status === PrepaidPurchaseStatus.CANCELLED).length,
      customerCount: new Set(awaitingDelivery.map((view) => view.customer.id)).size,
      basis: 'filtered',
    };
  }

  private static toAuditValues(prepaid: PrepaidPurchaseWithDetails) {
    const balance = this.balanceOf(prepaid);
    return {
      status: prepaid.status,
      deliveredAt: prepaid.deliveredAt ? prismaDateToBusinessDate(prepaid.deliveredAt) : null,
      deliveryNotes: prepaid.deliveryNotes,
      remainderDebtId: prepaid.remainderDebtId,
      itemName: prepaid.debt.description,
      fullAmount: moneyToApiString(prepaid.debt.originalAmount),
      amountPaid: moneyToApiString(balance.totalPaid),
    };
  }
}
