import {
  DebtStatus,
  InstallmentPlanStatus,
  InstallmentStatus,
  SalesOrderPaymentStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  businessDateToPrisma,
  calculateDebtBalance,
  calculateInstallmentBalance,
  compareBusinessDates,
  compareMoney,
  determineDebtStatus,
  determineInstallmentPlanStatus,
  determineInstallmentStatus,
  isPaymentAllocationVoided,
  moneyToApiString,
  parseBusinessDate,
  prismaDateToBusinessDate,
  subtractMoney,
  sumMoney,
  todayInBusinessTimezone,
  ZERO_MONEY,
} from '../index';
import {
  FinancialLedgerDebtRecord,
  FinancialLedgerCorrectionMarker,
  FinancialLedgerPaymentRecord,
  FinancialLedgerPlanRecord,
  FinancialLedgerRepository,
} from './financial-ledger.repository';
import {
  FinancialLedgerDebtItem,
  FinancialLedgerItem,
  FinancialLedgerPaymentItem,
  FinancialLedgerPlanItem,
  FinancialLedgerCorrectionView,
  FinancialLedgerView,
} from './financial-ledger.types';
import { FinancialLedgerQueryInput } from './financial-ledger.validator';

interface DebtComputation {
  item: FinancialLedgerDebtItem;
  remainingBalance: Decimal;
  totalPaid: Decimal;
  dueDate: string;
}

interface PlanComputation {
  item: FinancialLedgerPlanItem;
  remainingBalance: Decimal;
  totalPaid: Decimal;
  status: InstallmentPlanStatus;
  overdueInstallmentCount: number;
  installments: Array<{
    dueDate: string;
    totalPaid: Decimal;
    remainingAmount: Decimal;
    isCancelled: boolean;
  }>;
}

export class FinancialLedgerService {
  static async getFinancialLedger(query: FinancialLedgerQueryInput): Promise<FinancialLedgerView> {
    const type = query.type;
    const includeDebts = type === 'ALL' || type === 'DEBT' || type === 'OVERDUE';
    const includePlans = type === 'ALL' || type === 'INSTALLMENT_PLAN' || type === 'OVERDUE';
    const includePayments = type === 'ALL' || type === 'PAYMENT';

    const records = await FinancialLedgerRepository.loadFinancialLedger({
      customerId: query.customerId,
      search: query.search,
      dueFrom: query.dueFrom ? businessDateToPrisma(parseBusinessDate(query.dueFrom)) : undefined,
      dueTo: query.dueTo ? businessDateToPrisma(parseBusinessDate(query.dueTo)) : undefined,
      paymentFrom: query.paymentFrom
        ? businessDateToPrisma(parseBusinessDate(query.paymentFrom))
        : undefined,
      paymentTo: query.paymentTo ? businessDateToPrisma(parseBusinessDate(query.paymentTo)) : undefined,
      includeCancelled: query.includeCancelled,
      includeDebts,
      includePlans,
      includePayments,
    });

    const businessDate = todayInBusinessTimezone();
    const correctionMarkers = await FinancialLedgerRepository.loadCorrectionMarkers({
      debtIds: records.debts.map((debt) => debt.id),
      planIds: records.plans.map((plan) => plan.id),
      paymentIds: records.payments.map((payment) => payment.id),
    });
    const debtComputations = records.debts.map((debt) =>
      this.computeDebt(debt, businessDate, correctionMarkers.debts.get(debt.id))
    );
    const planComputations = records.plans.map((plan) =>
      this.computePlan(plan, businessDate, correctionMarkers.plans.get(plan.id), query)
    );
    const paymentItems = records.payments.map((payment) =>
      this.toPaymentItem(payment, correctionMarkers.payments.get(payment.id))
    );

    const filteredDebts = debtComputations.filter((debt) => this.matchesDebtFilters(debt, query));
    const filteredPlans = planComputations.filter((plan) => this.matchesPlanFilters(plan, query));
    const filteredPayments = paymentItems.filter((payment) => this.matchesPaymentFilters(payment, query));
    const summaryDebts = filteredDebts;
    const summaryPlans = filteredPlans;
    const activeStandardDebts = summaryDebts.filter(
      (debt) =>
        debt.item.status !== DebtStatus.PAID && debt.item.status !== DebtStatus.CANCELLED
    );
    const activePlans = summaryPlans.filter(
      (plan) =>
        plan.status !== InstallmentPlanStatus.COMPLETED &&
        plan.status !== InstallmentPlanStatus.CANCELLED
    );
    const hasDueDateFilter = Boolean(query.dueFrom || query.dueTo);
    const hasPaymentDateFilter = Boolean(query.paymentFrom || query.paymentTo);
    const summaryPayments = paymentItems.filter((payment) => this.matchesPaymentSummaryFilters(payment, query));
    const summaryStandardDebts = summaryDebts;
    const summaryTotalPaid =
      hasDueDateFilter
        ? sumMoney([
            ...summaryStandardDebts.map((debt) => debt.totalPaid),
            ...summaryPlans.map((plan) => this.planPaidForSummary(plan, query)),
          ])
        : hasPaymentDateFilter
        ? sumMoney(summaryPayments.map((payment) => this.paymentAllocationTotal(payment)))
        : summaryDebts.length > 0 || summaryPlans.length > 0
        ? sumMoney([
            ...summaryStandardDebts.map((debt) => debt.totalPaid),
            ...summaryPlans.map((plan) => plan.totalPaid),
          ])
        : sumMoney(filteredPayments.map((payment) => this.paymentAllocationTotal(payment)));

    const allItems: FinancialLedgerItem[] = [
      ...filteredDebts.map((debt) => debt.item),
      ...filteredPlans.map((plan) => plan.item),
      ...filteredPayments,
    ].sort((left, right) => this.compareLedgerItems(left, right, query.sortBy, query.sortOrder));

    const total = allItems.length;
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    const start = (query.page - 1) * query.limit;
    const items = allItems.slice(start, start + query.limit);

    return {
      summary: {
        basis: 'filtered',
        totalOutstanding: moneyToApiString(
          sumMoney([
            ...summaryDebts
              .filter((debt) => debt.item.status !== DebtStatus.CANCELLED)
              .map((debt) => debt.remainingBalance),
            ...summaryPlans
              .filter((plan) => plan.status !== InstallmentPlanStatus.CANCELLED)
              .map((plan) => this.planOutstandingForSummary(plan, query)),
          ])
        ),
        totalPaid: moneyToApiString(summaryTotalPaid),
        activeDebtCount: activeStandardDebts.length,
        activePlanCount: activePlans.length,
        activeCustomerCount: new Set([
          ...activeStandardDebts.map((debt) => debt.item.customer.id),
          ...activePlans.map((plan) => plan.item.customer.id),
        ]).size,
        overdueDebtCount: summaryDebts.filter((debt) => debt.item.status === DebtStatus.OVERDUE)
          .length,
        overdueInstallmentCount: summaryPlans.reduce(
          (totalOverdue, plan) => totalOverdue + plan.overdueInstallmentCount,
          0
        ),
      },
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
      },
    };
  }

  private static computeDebt(
    debt: FinancialLedgerDebtRecord,
    businessDate: string,
    correctionMarker?: FinancialLedgerCorrectionMarker
  ): DebtComputation {
    const balance = calculateDebtBalance({
      originalAmount: debt.originalAmount,
      allocations: debt.paymentAllocations.map((allocation) => ({
        amount: allocation.amount,
        isVoided: isPaymentAllocationVoided(allocation),
      })),
    });
    const dueDate = prismaDateToBusinessDate(debt.dueDate);
    const status = determineDebtStatus({
      isCancelled: debt.status === DebtStatus.CANCELLED || Boolean(debt.cancelledAt),
      dueDate,
      businessDate,
      balance,
      overdueEligible: true,
    });
    const displayStatus =
      status === DebtStatus.UNPAID &&
      debt.salesOrder?.paymentStatus === SalesOrderPaymentStatus.PARTIALLY_PAID
        ? DebtStatus.PARTIALLY_PAID
        : status;

    return {
      item: {
        type: 'DEBT',
        kind: debt.kind,
        id: debt.id,
        customer: debt.customer,
        description: debt.description,
        originalAmount: moneyToApiString(debt.originalAmount),
        totalPaid: moneyToApiString(balance.totalPaid),
        remainingBalance: moneyToApiString(balance.remainingBalance),
        adminDebt: moneyToApiString(ZERO_MONEY),
        dueDate,
        status,
        displayStatus,
        // Display only. Null when there is no linked sale or no deposit was taken,
        // so the row never shows a "Deposit at sale: $0.00" line.
        saleDepositAmount:
          debt.salesOrder && compareMoney(debt.salesOrder.paidAmount, ZERO_MONEY) > 0
            ? moneyToApiString(debt.salesOrder.paidAmount)
            : null,
        storedStatus: debt.status,
        notes: debt.notes,
        createdAt: debt.createdAt.toISOString(),
        updatedAt: debt.updatedAt.toISOString(),
        cancellation: debt.cancelledAt
          ? {
              cancelledAt: debt.cancelledAt.toISOString(),
              reason: debt.cancelReason,
            }
          : null,
        correction: this.toCorrectionView(correctionMarker),
      },
      totalPaid: balance.totalPaid,
      remainingBalance: balance.remainingBalance,
      dueDate,
    };
  }

  private static computePlan(
    plan: FinancialLedgerPlanRecord,
    businessDate: string,
    correctionMarker: FinancialLedgerCorrectionMarker | undefined,
    query: FinancialLedgerQueryInput
  ): PlanComputation {
    const planIsCancelled = plan.status === InstallmentPlanStatus.CANCELLED || Boolean(plan.cancelledAt);
    const installments = plan.installments.map((installment) => {
      const balance = calculateInstallmentBalance({
        amountDue: installment.amountDue,
        allocations: installment.paymentAllocations.map((allocation) => ({
          amount: allocation.amount,
          isVoided: isPaymentAllocationVoided(allocation),
        })),
      });
      const dueDate = prismaDateToBusinessDate(installment.dueDate);
      const status = determineInstallmentStatus({
        isCancelled: planIsCancelled || installment.status === InstallmentStatus.CANCELLED,
        dueDate,
        businessDate,
        balance,
      });

      return {
        id: installment.id,
        installmentNumber: installment.installmentNumber,
        dueDate,
        amountDue: installment.amountDue,
        totalPaid: balance.totalPaid,
        remainingAmount: balance.remainingBalance,
        status,
        isCancelled: planIsCancelled || installment.status === InstallmentStatus.CANCELLED,
      };
    });
    const activeInstallments = installments.filter((installment) => !installment.isCancelled);
    const totalPaid = sumMoney(installments.map((installment) => installment.totalPaid));
    const remainingBalance = subtractMoney(plan.totalAmount, totalPaid);
    const completedInstallmentCount = activeInstallments.filter(
      (installment) => installment.status === InstallmentStatus.PAID
    ).length;
    const overdueInstallmentCount = activeInstallments.filter(
      (installment) => installment.status === InstallmentStatus.OVERDUE
    ).length;
    const nextInstallment =
      activeInstallments
        .filter(
          (installment) =>
            installment.status !== InstallmentStatus.PAID &&
            installment.remainingAmount.greaterThan(ZERO_MONEY)
        )
        .sort((left, right) => {
          const dateComparison = compareBusinessDates(left.dueDate, right.dueDate);
          return dateComparison === 0
            ? left.installmentNumber - right.installmentNumber
            : dateComparison;
        })[0] ?? null;
    const status = determineInstallmentPlanStatus({
      isCancelled: planIsCancelled,
      installments: installments.map((installment) => ({ status: installment.status })),
    });

    return {
      item: {
        type: 'INSTALLMENT_PLAN',
        id: plan.id,
        customer: plan.customer,
        description: plan.description,
        totalAmount: moneyToApiString(plan.totalAmount),
        totalPaid: moneyToApiString(totalPaid),
        remainingBalance: moneyToApiString(remainingBalance),
        startDate: prismaDateToBusinessDate(plan.startDate),
        installmentCount: plan.installmentCount,
        frequency: plan.frequency,
        completedInstallmentCount,
        overdueInstallmentCount,
        nextDueDate: nextInstallment?.dueDate ?? null,
        status,
        storedStatus: plan.status,
        notes: plan.notes,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
        cancellation: plan.cancelledAt
          ? {
              cancelledAt: plan.cancelledAt.toISOString(),
              reason: plan.cancelReason,
            }
          : null,
        scheduleSummary: {
          totalInstallments: installments.length,
          completedInstallments: completedInstallmentCount,
          remainingInstallments: activeInstallments.length - completedInstallmentCount,
          nextInstallment: nextInstallment
            ? {
                id: nextInstallment.id,
                installmentNumber: nextInstallment.installmentNumber,
                dueDate: nextInstallment.dueDate,
                remainingAmount: moneyToApiString(nextInstallment.remainingAmount),
                status: nextInstallment.status,
              }
            : null,
        },
        periodSummary: this.toPlanPeriodSummary(activeInstallments, query),
        correction: this.toCorrectionView(correctionMarker),
      },
      totalPaid,
      remainingBalance,
      status,
      overdueInstallmentCount,
      installments: activeInstallments.map((installment) => ({
        dueDate: installment.dueDate,
        totalPaid: installment.totalPaid,
        remainingAmount: installment.remainingAmount,
        isCancelled: installment.isCancelled,
      })),
    };
  }

  private static toPaymentItem(
    payment: FinancialLedgerPaymentRecord,
    correctionMarker?: FinancialLedgerCorrectionMarker
  ): FinancialLedgerPaymentItem {
    return {
      type: 'PAYMENT',
      id: payment.id,
      customer: payment.customer,
      amount: moneyToApiString(payment.totalAmount),
      paymentDate: prismaDateToBusinessDate(payment.paymentDate),
      paymentMethod: payment.paymentMethod,
      status: payment.voidedAt ? 'VOIDED' : 'COMPLETED',
      reference: payment.reference,
      notes: payment.notes,
      idempotencyKey: payment.idempotencyKey,
      createdAt: payment.createdAt.toISOString(),
      voidedAt: payment.voidedAt?.toISOString() ?? null,
      allocations: payment.allocations.map((allocation) => {
        const targetType = allocation.debtId
          ? 'DEBT'
          : allocation.installmentId
            ? 'INSTALLMENT'
            : 'UNKNOWN';

        return {
          id: allocation.id,
          targetType,
          debtId: allocation.debtId,
          installmentId: allocation.installmentId,
          planId: allocation.installment?.installmentPlanId ?? null,
          description:
            allocation.debt?.description ?? allocation.installment?.installmentPlan.description ?? null,
          amount: moneyToApiString(allocation.amount),
          createdAt: allocation.createdAt.toISOString(),
        };
      }),
      correction: this.toCorrectionView(correctionMarker),
    };
  }

  private static matchesDebtFilters(
    debt: DebtComputation,
    query: FinancialLedgerQueryInput
  ): boolean {
    if (query.correctedOnly && !debt.item.correction.hasCorrections) return false;
    if (query.type === 'OVERDUE' && debt.item.status !== DebtStatus.OVERDUE) return false;
    if (!query.includeCancelled && debt.item.status === DebtStatus.CANCELLED) return false;
    if (this.shouldHideCompleted(query) && debt.item.status === DebtStatus.PAID) return false;
    return this.matchesStatusFilter(debt.item.status, query.status);
  }

  private static matchesPlanFilters(
    plan: PlanComputation,
    query: FinancialLedgerQueryInput
  ): boolean {
    if (query.correctedOnly && !plan.item.correction.hasCorrections) return false;
    if (query.type === 'OVERDUE' && plan.status !== InstallmentPlanStatus.OVERDUE) return false;
    if (!query.includeCancelled && plan.status === InstallmentPlanStatus.CANCELLED) return false;
    if (this.shouldHideCompleted(query) && plan.status === InstallmentPlanStatus.COMPLETED) return false;
    return this.matchesStatusFilter(plan.status, query.status);
  }

  private static matchesPaymentFilters(
    payment: FinancialLedgerPaymentItem,
    query: FinancialLedgerQueryInput
  ): boolean {
    if (query.correctedOnly && !payment.correction.hasCorrections) return false;
    if (!query.includeCancelled && payment.status === 'VOIDED') return false;
    if (this.shouldHideCompleted(query) && payment.status === 'COMPLETED') return false;
    if (!query.status) return true;
    if (query.status === 'CANCELLED') return payment.status === 'VOIDED';
    if (query.status === 'PAID_COMPLETED') return payment.status === 'COMPLETED';
    return false;
  }

  private static matchesPaymentSummaryFilters(
    payment: FinancialLedgerPaymentItem,
    query: FinancialLedgerQueryInput
  ): boolean {
    if (query.correctedOnly && !payment.correction.hasCorrections) return false;
    if (!query.includeCancelled && payment.status === 'VOIDED') return false;
    if (!query.status) return true;
    if (query.status === 'CANCELLED') return payment.status === 'VOIDED';
    if (query.status === 'PAID_COMPLETED') return payment.status === 'COMPLETED';
    return false;
  }

  private static matchesStatusFilter(
    status: DebtStatus | InstallmentPlanStatus,
    filter: FinancialLedgerQueryInput['status']
  ): boolean {
    const value = String(status);
    if (!filter) return true;
    if (filter === 'ACTIVE') {
      return ['UNPAID', 'PARTIALLY_PAID', 'ACTIVE'].includes(value);
    }
    if (filter === 'OVERDUE') return value === 'OVERDUE';
    if (filter === 'PAID_COMPLETED') {
      return value === 'PAID' || value === 'COMPLETED';
    }
    return value === 'CANCELLED';
  }

  private static compareLedgerItems(
    left: FinancialLedgerItem,
    right: FinancialLedgerItem,
    sortBy: FinancialLedgerQueryInput['sortBy'],
    sortOrder: FinancialLedgerQueryInput['sortOrder']
  ): number {
    const direction = sortOrder === 'asc' ? 1 : -1;
    let comparison = 0;
    const stateComparison = this.itemStateRank(left) - this.itemStateRank(right);
    if (stateComparison !== 0) return stateComparison;

    if (sortBy === 'customer') {
      comparison = left.customer.name.localeCompare(right.customer.name);
    } else if (sortBy === 'amount') {
      comparison = this.itemAmount(left).comparedTo(this.itemAmount(right));
    } else if (sortBy === 'createdAt') {
      comparison = left.createdAt.localeCompare(right.createdAt);
    } else {
      comparison = this.itemBusinessDate(left).localeCompare(this.itemBusinessDate(right));
    }

    if (comparison === 0) comparison = left.id.localeCompare(right.id);
    return comparison * direction;
  }

  private static itemBusinessDate(item: FinancialLedgerItem): string {
    if (item.type === 'DEBT') return item.dueDate;
    if (item.type === 'INSTALLMENT_PLAN') return item.nextDueDate ?? item.startDate;
    return item.paymentDate;
  }

  private static itemAmount(item: FinancialLedgerItem): Decimal {
    if (item.type === 'DEBT') return new Decimal(item.originalAmount);
    if (item.type === 'INSTALLMENT_PLAN') return new Decimal(item.totalAmount);
    return new Decimal(item.amount);
  }

  private static itemStateRank(item: FinancialLedgerItem): number {
    if (item.type === 'DEBT') {
      if (item.status === DebtStatus.CANCELLED) return 2;
      if (item.status === DebtStatus.PAID) return 1;
      return 0;
    }
    if (item.type === 'INSTALLMENT_PLAN') {
      if (item.status === InstallmentPlanStatus.CANCELLED) return 2;
      if (item.status === InstallmentPlanStatus.COMPLETED) return 1;
      return 0;
    }
    if (item.status === 'VOIDED') return 2;
    return 1;
  }

  private static shouldHideCompleted(query: FinancialLedgerQueryInput): boolean {
    return !query.includeCompleted && query.status !== 'PAID_COMPLETED' && query.type !== 'PAYMENT';
  }

  private static paymentAllocationTotal(payment: FinancialLedgerPaymentItem): Decimal {
    if (payment.status === 'VOIDED') return ZERO_MONEY;
    return sumMoney(payment.allocations.map((allocation) => new Decimal(allocation.amount)));
  }

  private static planOutstandingForSummary(
    plan: PlanComputation,
    query: FinancialLedgerQueryInput
  ): Decimal {
    if (!query.dueFrom && !query.dueTo) return plan.remainingBalance;

    return sumMoney(
      plan.installments
        .filter((installment) => !installment.isCancelled)
        .filter((installment) => {
          if (query.dueFrom && compareBusinessDates(installment.dueDate, query.dueFrom) < 0) {
            return false;
          }
          if (query.dueTo && compareBusinessDates(installment.dueDate, query.dueTo) > 0) {
            return false;
          }
          return true;
        })
        .map((installment) => installment.remainingAmount)
    );
  }

  private static planPaidForSummary(plan: PlanComputation, query: FinancialLedgerQueryInput): Decimal {
    if (!query.dueFrom && !query.dueTo) return plan.totalPaid;

    return sumMoney(
      plan.installments
        .filter((installment) => !installment.isCancelled)
        .filter((installment) => {
          if (query.dueFrom && compareBusinessDates(installment.dueDate, query.dueFrom) < 0) {
            return false;
          }
          if (query.dueTo && compareBusinessDates(installment.dueDate, query.dueTo) > 0) {
            return false;
          }
          return true;
        })
        .map((installment) => installment.totalPaid)
    );
  }

  private static toPlanPeriodSummary(
    installments: Array<{
      dueDate: string;
      amountDue: Decimal;
      totalPaid: Decimal;
      remainingAmount: Decimal;
      isCancelled: boolean;
    }>,
    query: FinancialLedgerQueryInput
  ): FinancialLedgerPlanItem['periodSummary'] {
    if (!query.dueFrom && !query.dueTo) return null;

    const periodInstallments = installments
      .filter((installment) => !installment.isCancelled)
      .filter((installment) => {
        if (query.dueFrom && compareBusinessDates(installment.dueDate, query.dueFrom) < 0) return false;
        if (query.dueTo && compareBusinessDates(installment.dueDate, query.dueTo) > 0) return false;
        return true;
      });

    return {
      dueFrom: query.dueFrom ?? null,
      dueTo: query.dueTo ?? null,
      installmentCount: periodInstallments.length,
      totalDue: moneyToApiString(sumMoney(periodInstallments.map((installment) => installment.amountDue))),
      totalPaid: moneyToApiString(sumMoney(periodInstallments.map((installment) => installment.totalPaid))),
      totalRemaining: moneyToApiString(
        sumMoney(periodInstallments.map((installment) => installment.remainingAmount))
      ),
    };
  }

  private static toCorrectionView(
    correctionMarker?: FinancialLedgerCorrectionMarker
  ): FinancialLedgerCorrectionView {
    return {
      hasCorrections: correctionMarker?.hasCorrections ?? false,
      correctionCount: correctionMarker?.correctionCount ?? 0,
      lastCorrectedAt: correctionMarker?.lastCorrectedAt?.toISOString() ?? null,
    };
  }
}
