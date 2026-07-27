import {
  DebtStatus,
  InstallmentPlanFrequency,
  InstallmentPlanStatus,
  InstallmentStatus,
  PaymentMethod,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundError } from '../../../lib/errors';
import {
  BusinessDate,
  businessDateToPrisma,
  calculateDebtBalance,
  calculateInstallmentBalance,
  compareBusinessDates,
  determineDebtStatus,
  determineInstallmentPlanStatus,
  determineInstallmentStatus,
  isPaymentAllocationVoided,
  moneyToApiString,
  prismaDateToBusinessDate,
  subtractMoney,
  sumMoney,
  todayInBusinessTimezone,
  ZERO_MONEY,
} from '../index';
import {
  CustomerFinancialSummaryRepository,
  FinancialSummaryDebt,
  FinancialSummaryPayment,
  FinancialSummaryPlan,
} from './customer-financial-summary.repository';
import { CustomerFinancialSummaryQueryInput } from './customer-financial-summary.validator';

type DueItemType = 'DEBT' | 'INSTALLMENT';
type PaymentAllocationTargetType = DueItemType | 'UNKNOWN';

interface UserView {
  id: string;
  name: string;
  username: string;
}

interface CustomerView {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  notes: string | null;
  isActive: boolean;
}

interface DebtSummaryView {
  id: string;
  description: string;
  originalAmount: string;
  totalPaid: string;
  remainingBalance: string;
  dueDate: string;
  status: DebtStatus;
  calculatedStatus: DebtStatus;
  storedStatus: DebtStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: UserView;
  cancellation: CancellationView | null;
}

interface InstallmentPlanSummaryView {
  id: string;
  description: string;
  totalAmount: string;
  totalPaid: string;
  remainingBalance: string;
  startDate: string;
  installmentCount: number;
  frequency: InstallmentPlanFrequency;
  completedInstallmentCount: number;
  overdueInstallmentCount: number;
  nextDueDate: string | null;
  status: InstallmentPlanStatus;
  calculatedStatus: InstallmentPlanStatus;
  storedStatus: InstallmentPlanStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: UserView;
  cancellation: CancellationView | null;
  scheduleSummary: {
    totalInstallments: number;
    completedInstallments: number;
    remainingInstallments: number;
    nextInstallment: {
      id: string;
      installmentNumber: number;
      dueDate: string;
      remainingAmount: string;
      status: InstallmentStatus;
    } | null;
  };
}

interface CancellationView {
  cancelledAt: string;
  reason: string | null;
  cancelledBy: UserView | null;
}

interface OverdueItemView {
  type: DueItemType;
  obligationId: string;
  planId: string | null;
  description: string;
  dueDate: string;
  originalDueAmount: string;
  paidAmount: string;
  remainingAmount: string;
  daysOverdue: number;
  calculatedStatus: DebtStatus | InstallmentStatus;
}

interface NextDueView {
  date: string;
  totalAmount: string;
  items: Array<{
    type: DueItemType;
    id: string;
    planId: string | null;
    description: string;
    remainingAmount: string;
  }>;
}

interface RecentPaymentView {
  id: string;
  totalAmount: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  reference: string | null;
  notes: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  createdBy: UserView;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: UserView | null;
  allocations: Array<{
    id: string;
    targetType: PaymentAllocationTargetType;
    debtId: string | null;
    installmentId: string | null;
    planId: string | null;
    description: string | null;
    amount: string;
    createdAt: string;
  }>;
}

interface CustomerFinancialSummaryView {
  customer: CustomerView;
  summary: {
    totalOutstanding: string;
    singleDebtOutstanding: string;
    installmentPlanOutstanding: string;
    totalPaid: string;
    activeDebtCount: number;
    activePlanCount: number;
    overdueDebtCount: number;
    overdueInstallmentCount: number;
    nextDueDate: string | null;
    nextDueAmount: string;
  };
  debts: DebtSummaryView[];
  installmentPlans: InstallmentPlanSummaryView[];
  overdueItems: OverdueItemView[];
  nextDue: NextDueView | null;
  recentPayments: RecentPaymentView[];
}

interface DebtComputation {
  view: DebtSummaryView;
  totalPaid: Decimal;
  remainingBalance: Decimal;
  dueDate: BusinessDate;
  isCancelled: boolean;
}

interface InstallmentComputation {
  id: string;
  installmentNumber: number;
  planId: string;
  planDescription: string;
  dueDate: BusinessDate;
  amountDue: Decimal;
  totalPaid: Decimal;
  remainingAmount: Decimal;
  status: InstallmentStatus;
  isCancelled: boolean;
}

interface PlanComputation {
  view: InstallmentPlanSummaryView;
  totalPaid: Decimal;
  remainingBalance: Decimal;
  status: InstallmentPlanStatus;
  installments: InstallmentComputation[];
  isCancelled: boolean;
}

export class CustomerFinancialSummaryService {
  static async getCustomerFinancialSummary(
    customerId: string,
    query: CustomerFinancialSummaryQueryInput
  ): Promise<CustomerFinancialSummaryView> {
    const records = await CustomerFinancialSummaryRepository.loadCustomerFinancialSummary({
      customerId,
      includeCancelled: query.includeCancelled,
      includePayments: query.includePayments,
      paymentLimit: query.paymentLimit,
    });

    if (!records.customer) {
      throw new NotFoundError('Customer not found');
    }

    const businessDate = todayInBusinessTimezone();
    const debtComputations = records.debts.map((debt) => this.computeDebt(debt, businessDate));
    const planComputations = records.plans.map((plan) => this.computePlan(plan, businessDate));
    const totalPaid = sumMoney([
      ...debtComputations.map((debt) => debt.totalPaid),
      ...planComputations.map((plan) => plan.totalPaid),
    ]);

    const activeDebts = debtComputations.filter(
      (debt) => debt.view.calculatedStatus !== DebtStatus.PAID && debt.view.calculatedStatus !== DebtStatus.CANCELLED
    );
    const activePlans = planComputations.filter(
      (plan) => plan.status !== InstallmentPlanStatus.COMPLETED && plan.status !== InstallmentPlanStatus.CANCELLED
    );
    const overdueInstallments = planComputations.flatMap((plan) =>
      plan.installments.filter((installment) => installment.status === InstallmentStatus.OVERDUE)
    );
    const singleDebtOutstanding = sumMoney(
      debtComputations
        .filter((debt) => !debt.isCancelled)
        .map((debt) => debt.remainingBalance)
    );
    const installmentPlanOutstanding = sumMoney(
      planComputations
        .filter((plan) => !plan.isCancelled)
        .map((plan) => plan.remainingBalance)
    );
    const nextDue = this.calculateNextDue(activeDebts, activePlans);

    return {
      customer: {
        id: records.customer.id,
        name: records.customer.name,
        phone: records.customer.phone,
        address: records.customer.address,
        notes: records.customer.notes,
        isActive: records.customer.isActive,
      },
      summary: {
        totalOutstanding: moneyToApiString(sumMoney([singleDebtOutstanding, installmentPlanOutstanding])),
        singleDebtOutstanding: moneyToApiString(singleDebtOutstanding),
        installmentPlanOutstanding: moneyToApiString(installmentPlanOutstanding),
        totalPaid: moneyToApiString(totalPaid),
        activeDebtCount: activeDebts.length,
        activePlanCount: activePlans.length,
        overdueDebtCount: debtComputations.filter(
          (debt) => debt.view.calculatedStatus === DebtStatus.OVERDUE
        ).length,
        overdueInstallmentCount: overdueInstallments.length,
        nextDueDate: nextDue?.date ?? null,
        nextDueAmount: nextDue?.totalAmount ?? moneyToApiString(ZERO_MONEY),
      },
      debts: debtComputations.slice(0, query.debtLimit).map((debt) => debt.view),
      installmentPlans: planComputations.slice(0, query.planLimit).map((plan) => plan.view),
      overdueItems: this.buildOverdueItems(debtComputations, overdueInstallments, businessDate),
      nextDue,
      recentPayments: query.includePayments
        ? records.recentPayments.map((payment) => this.toPaymentView(payment))
        : [],
    };
  }

  private static computeDebt(debt: FinancialSummaryDebt, businessDate: BusinessDate): DebtComputation {
    const balance = calculateDebtBalance({
      originalAmount: debt.originalAmount,
      allocations: debt.paymentAllocations.map((allocation) => ({
        amount: allocation.amount,
        isVoided: isPaymentAllocationVoided(allocation),
      })),
    });
    const dueDate = prismaDateToBusinessDate(debt.dueDate);
    const isCancelled = debt.status === DebtStatus.CANCELLED || Boolean(debt.cancelledAt);
    const calculatedStatus = determineDebtStatus({
      isCancelled,
      dueDate,
      businessDate,
      balance,
    });

    return {
      view: {
        id: debt.id,
        description: debt.description,
        originalAmount: moneyToApiString(debt.originalAmount),
        totalPaid: moneyToApiString(balance.totalPaid),
        remainingBalance: moneyToApiString(balance.remainingBalance),
        dueDate,
        status: calculatedStatus,
        calculatedStatus,
        storedStatus: debt.status,
        notes: debt.notes,
        createdAt: debt.createdAt.toISOString(),
        updatedAt: debt.updatedAt.toISOString(),
        createdBy: this.toUserView(debt.createdBy),
        cancellation: this.toCancellationView(debt.cancelledAt, debt.cancelReason, debt.cancelledBy),
      },
      totalPaid: balance.totalPaid,
      remainingBalance: balance.remainingBalance,
      dueDate,
      isCancelled,
    };
  }

  private static computePlan(plan: FinancialSummaryPlan, businessDate: BusinessDate): PlanComputation {
    const planIsCancelled = plan.status === InstallmentPlanStatus.CANCELLED || Boolean(plan.cancelledAt);
    const installments = plan.installments.map((installment): InstallmentComputation => {
      const balance = calculateInstallmentBalance({
        amountDue: installment.amountDue,
        allocations: installment.paymentAllocations.map((allocation) => ({
          amount: allocation.amount,
          isVoided: isPaymentAllocationVoided(allocation),
        })),
      });
      const dueDate = prismaDateToBusinessDate(installment.dueDate);
      const installmentIsCancelled = planIsCancelled || installment.status === InstallmentStatus.CANCELLED;
      const status = determineInstallmentStatus({
        isCancelled: installmentIsCancelled,
        dueDate,
        businessDate,
        balance,
      });

      return {
        id: installment.id,
        installmentNumber: installment.installmentNumber,
        planId: plan.id,
        planDescription: plan.description,
        dueDate,
        amountDue: installment.amountDue,
        totalPaid: balance.totalPaid,
        remainingAmount: balance.remainingBalance,
        status,
        isCancelled: installmentIsCancelled,
      };
    });
    const totalPaid = sumMoney(installments.map((installment) => installment.totalPaid));
    const remainingBalance = subtractMoney(plan.totalAmount, totalPaid);
    const activeInstallments = installments.filter((installment) => !installment.isCancelled);
    const completedInstallmentCount = activeInstallments.filter(
      (installment) => installment.status === InstallmentStatus.PAID
    ).length;
    const overdueInstallmentCount = activeInstallments.filter(
      (installment) => installment.status === InstallmentStatus.OVERDUE
    ).length;
    const nextInstallment =
      activeInstallments
        .filter((installment) => installment.status !== InstallmentStatus.PAID)
        .sort(this.sortInstallmentsByDueDate)[0] ?? null;
    const calculatedStatus = determineInstallmentPlanStatus({
      isCancelled: planIsCancelled,
      installments: installments.map((installment) => ({ status: installment.status })),
    });

    return {
      view: {
        id: plan.id,
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
        status: calculatedStatus,
        calculatedStatus,
        storedStatus: plan.status,
        notes: plan.notes,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
        createdBy: this.toUserView(plan.createdBy),
        cancellation: this.toCancellationView(plan.cancelledAt, plan.cancelReason, plan.cancelledBy),
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
      status: calculatedStatus,
      installments,
      isCancelled: planIsCancelled,
    };
  }

  private static buildOverdueItems(
    debts: DebtComputation[],
    overdueInstallments: InstallmentComputation[],
    businessDate: BusinessDate
  ): OverdueItemView[] {
    const overdueDebts = debts
      .filter((debt) => debt.view.calculatedStatus === DebtStatus.OVERDUE)
      .map((debt): OverdueItemView => ({
        type: 'DEBT',
        obligationId: debt.view.id,
        planId: null,
        description: debt.view.description,
        dueDate: debt.dueDate,
        originalDueAmount: debt.view.originalAmount,
        paidAmount: debt.view.totalPaid,
        remainingAmount: debt.view.remainingBalance,
        daysOverdue: this.calculateDaysOverdue(debt.dueDate, businessDate),
        calculatedStatus: DebtStatus.OVERDUE,
      }));

    const installmentItems = overdueInstallments.map((installment): OverdueItemView => ({
      type: 'INSTALLMENT',
      obligationId: installment.id,
      planId: installment.planId,
      description: installment.planDescription,
      dueDate: installment.dueDate,
      originalDueAmount: moneyToApiString(installment.amountDue),
      paidAmount: moneyToApiString(installment.totalPaid),
      remainingAmount: moneyToApiString(installment.remainingAmount),
      daysOverdue: this.calculateDaysOverdue(installment.dueDate, businessDate),
      calculatedStatus: InstallmentStatus.OVERDUE,
    }));

    return [...overdueDebts, ...installmentItems].sort(this.sortOverdueItems);
  }

  private static calculateNextDue(
    debts: DebtComputation[],
    plans: PlanComputation[]
  ): NextDueView | null {
    const debtItems = debts.map((debt) => ({
      type: 'DEBT' as const,
      id: debt.view.id,
      planId: null,
      description: debt.view.description,
      dueDate: debt.dueDate,
      remainingAmount: debt.remainingBalance,
    }));
    const installmentItems = plans.flatMap((plan) =>
      plan.installments
        .filter(
          (installment) =>
            !installment.isCancelled &&
            installment.status !== InstallmentStatus.PAID &&
            installment.remainingAmount.greaterThan(ZERO_MONEY)
        )
        .map((installment) => ({
          type: 'INSTALLMENT' as const,
          id: installment.id,
          planId: installment.planId,
          description: installment.planDescription,
          dueDate: installment.dueDate,
          remainingAmount: installment.remainingAmount,
        }))
    );
    const candidates = [...debtItems, ...installmentItems].filter((item) =>
      item.remainingAmount.greaterThan(ZERO_MONEY)
    );

    if (candidates.length === 0) {
      return null;
    }

    const earliestDate = candidates
      .map((item) => item.dueDate)
      .sort(compareBusinessDates)[0];
    const sameDateItems = candidates
      .filter((item) => item.dueDate === earliestDate)
      .sort((left, right) =>
        left.type === right.type
          ? left.id.localeCompare(right.id)
          : left.type.localeCompare(right.type)
      );

    return {
      date: earliestDate,
      totalAmount: moneyToApiString(sumMoney(sameDateItems.map((item) => item.remainingAmount))),
      items: sameDateItems.map((item) => ({
        type: item.type,
        id: item.id,
        planId: item.planId,
        description: item.description,
        remainingAmount: moneyToApiString(item.remainingAmount),
      })),
    };
  }

  private static toPaymentView(payment: FinancialSummaryPayment): RecentPaymentView {
    return {
      id: payment.id,
      totalAmount: moneyToApiString(payment.totalAmount),
      paymentDate: prismaDateToBusinessDate(payment.paymentDate),
      paymentMethod: payment.paymentMethod,
      reference: payment.reference,
      notes: payment.notes,
      idempotencyKey: payment.idempotencyKey,
      createdAt: payment.createdAt.toISOString(),
      createdBy: this.toUserView(payment.createdBy),
      voidedAt: payment.voidedAt?.toISOString() ?? null,
      voidReason: payment.voidReason,
      voidedBy: payment.voidedBy ? this.toUserView(payment.voidedBy) : null,
      allocations: payment.allocations.map((allocation) => {
        const targetType: PaymentAllocationTargetType = allocation.debtId
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
          description: allocation.debt?.description ?? allocation.installment?.installmentPlan.description ?? null,
          amount: moneyToApiString(allocation.amount),
          createdAt: allocation.createdAt.toISOString(),
        };
      }),
    };
  }

  private static toUserView(user: { id: string; fullName: string; username: string }): UserView {
    return {
      id: user.id,
      name: user.fullName,
      username: user.username,
    };
  }

  private static toCancellationView(
    cancelledAt: Date | null,
    reason: string | null,
    cancelledBy: { id: string; fullName: string; username: string } | null
  ): CancellationView | null {
    if (!cancelledAt) {
      return null;
    }

    return {
      cancelledAt: cancelledAt.toISOString(),
      reason,
      cancelledBy: cancelledBy ? this.toUserView(cancelledBy) : null,
    };
  }

  private static calculateDaysOverdue(dueDate: BusinessDate, businessDate: BusinessDate): number {
    if (compareBusinessDates(dueDate, businessDate) >= 0) {
      return 0;
    }

    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    return Math.floor(
      (businessDateToPrisma(businessDate).getTime() - businessDateToPrisma(dueDate).getTime()) /
        millisecondsPerDay
    );
  }

  private static sortInstallmentsByDueDate(
    left: InstallmentComputation,
    right: InstallmentComputation
  ): number {
    const dateComparison = compareBusinessDates(left.dueDate, right.dueDate);
    if (dateComparison !== 0) return dateComparison;
    return left.installmentNumber - right.installmentNumber;
  }

  private static sortOverdueItems(left: OverdueItemView, right: OverdueItemView): number {
    const dateComparison = compareBusinessDates(left.dueDate, right.dueDate);
    if (dateComparison !== 0) return dateComparison;
    return left.obligationId.localeCompare(right.obligationId);
  }
}
