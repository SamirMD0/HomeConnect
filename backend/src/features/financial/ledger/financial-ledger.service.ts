import { DebtStatus, InstallmentPlanStatus, InstallmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  businessDateToPrisma,
  calculateDebtBalance,
  calculateInstallmentBalance,
  compareBusinessDates,
  determineDebtStatus,
  determineInstallmentPlanStatus,
  determineInstallmentStatus,
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
  FinancialLedgerPaymentRecord,
  FinancialLedgerPlanRecord,
  FinancialLedgerRepository,
} from './financial-ledger.repository';
import {
  FinancialLedgerDebtItem,
  FinancialLedgerItem,
  FinancialLedgerPaymentItem,
  FinancialLedgerPlanItem,
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
    const debtComputations = records.debts.map((debt) => this.computeDebt(debt, businessDate));
    const planComputations = records.plans.map((plan) => this.computePlan(plan, businessDate));
    const paymentItems = records.payments.map((payment) => this.toPaymentItem(payment));

    const filteredDebts = debtComputations.filter((debt) => this.matchesDebtFilters(debt, query));
    const filteredPlans = planComputations.filter((plan) => this.matchesPlanFilters(plan, query));
    const filteredPayments = paymentItems.filter((payment) => this.matchesPaymentFilters(payment, query));

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
        totalOutstanding: moneyToApiString(
          sumMoney([
            ...debtComputations
              .filter((debt) => debt.item.status !== DebtStatus.CANCELLED)
              .map((debt) => debt.remainingBalance),
            ...planComputations
              .filter((plan) => plan.status !== InstallmentPlanStatus.CANCELLED)
              .map((plan) => plan.remainingBalance),
          ])
        ),
        totalPaid: moneyToApiString(records.totalPaid),
        activeDebtCount: debtComputations.filter(
          (debt) => debt.item.status !== DebtStatus.PAID && debt.item.status !== DebtStatus.CANCELLED
        ).length,
        activePlanCount: planComputations.filter(
          (plan) =>
            plan.status !== InstallmentPlanStatus.COMPLETED &&
            plan.status !== InstallmentPlanStatus.CANCELLED
        ).length,
        overdueDebtCount: debtComputations.filter((debt) => debt.item.status === DebtStatus.OVERDUE)
          .length,
        overdueInstallmentCount: planComputations.reduce(
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

  private static computeDebt(debt: FinancialLedgerDebtRecord, businessDate: string): DebtComputation {
    const balance = calculateDebtBalance({
      originalAmount: debt.originalAmount,
      allocations: debt.paymentAllocations.map((allocation) => ({
        amount: allocation.amount,
        isVoided: Boolean(allocation.payment.voidedAt),
      })),
    });
    const dueDate = prismaDateToBusinessDate(debt.dueDate);
    const status = determineDebtStatus({
      isCancelled: debt.status === DebtStatus.CANCELLED || Boolean(debt.cancelledAt),
      dueDate,
      businessDate,
      balance,
    });

    return {
      item: {
        type: 'DEBT',
        id: debt.id,
        customer: debt.customer,
        description: debt.description,
        originalAmount: moneyToApiString(debt.originalAmount),
        totalPaid: moneyToApiString(balance.totalPaid),
        remainingBalance: moneyToApiString(balance.remainingBalance),
        dueDate,
        status,
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
      },
      totalPaid: balance.totalPaid,
      remainingBalance: balance.remainingBalance,
      dueDate,
    };
  }

  private static computePlan(plan: FinancialLedgerPlanRecord, businessDate: string): PlanComputation {
    const planIsCancelled = plan.status === InstallmentPlanStatus.CANCELLED || Boolean(plan.cancelledAt);
    const installments = plan.installments.map((installment) => {
      const balance = calculateInstallmentBalance({
        amountDue: installment.amountDue,
        allocations: installment.paymentAllocations.map((allocation) => ({
          amount: allocation.amount,
          isVoided: Boolean(allocation.payment.voidedAt),
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
      },
      totalPaid,
      remainingBalance,
      status,
      overdueInstallmentCount,
    };
  }

  private static toPaymentItem(payment: FinancialLedgerPaymentRecord): FinancialLedgerPaymentItem {
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
    };
  }

  private static matchesDebtFilters(
    debt: DebtComputation,
    query: FinancialLedgerQueryInput
  ): boolean {
    if (query.type === 'OVERDUE' && debt.item.status !== DebtStatus.OVERDUE) return false;
    if (!query.includeCancelled && debt.item.status === DebtStatus.CANCELLED) return false;
    return this.matchesStatusFilter(debt.item.status, query.status);
  }

  private static matchesPlanFilters(
    plan: PlanComputation,
    query: FinancialLedgerQueryInput
  ): boolean {
    if (query.type === 'OVERDUE' && plan.status !== InstallmentPlanStatus.OVERDUE) return false;
    if (!query.includeCancelled && plan.status === InstallmentPlanStatus.CANCELLED) return false;
    return this.matchesStatusFilter(plan.status, query.status);
  }

  private static matchesPaymentFilters(
    payment: FinancialLedgerPaymentItem,
    query: FinancialLedgerQueryInput
  ): boolean {
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
}
