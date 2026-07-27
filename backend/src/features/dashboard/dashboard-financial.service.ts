import { DebtStatus, InstallmentPlanStatus, InstallmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  calculateDebtBalance,
  calculateInstallmentBalance,
  calculateInstallmentPlanSummary,
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
} from '../financial';
import {
  DashboardDebtRecord,
  DashboardFinancialRepository,
  DashboardPaymentRecord,
  DashboardPlanRecord,
} from './dashboard-financial.repository';
import {
  DashboardFinancialSummaryView,
  DashboardOverdueCustomer,
  DashboardRecentPayment,
  DashboardUpcomingDueItem,
} from './dashboard-financial.types';

interface DebtComputation {
  record: DashboardDebtRecord;
  dueDate: string;
  remainingBalance: Decimal;
  status: DebtStatus;
}

interface InstallmentComputation {
  plan: DashboardPlanRecord;
  installment: DashboardPlanRecord['installments'][number];
  dueDate: string;
  remainingBalance: Decimal;
  status: InstallmentStatus;
}

interface PlanComputation {
  record: DashboardPlanRecord;
  remainingBalance: Decimal;
  status: InstallmentPlanStatus;
  installments: InstallmentComputation[];
}

export class DashboardFinancialService {
  static async getFinancialSummary(): Promise<DashboardFinancialSummaryView> {
    const records = await DashboardFinancialRepository.loadFinancialRecords();
    const businessDate = todayInBusinessTimezone();
    const monthStart = `${businessDate.slice(0, 7)}-01`;
    const debtComputations = records.debts.map((debt) => this.computeDebt(debt, businessDate));
    const planComputations = records.plans.map((plan) => this.computePlan(plan, businessDate));
    const outstandingCustomerIds = new Set<string>();

    for (const debt of debtComputations) {
      if (debt.remainingBalance.greaterThan(ZERO_MONEY) && debt.status !== DebtStatus.CANCELLED) {
        outstandingCustomerIds.add(debt.record.customer.id);
      }
    }
    for (const plan of planComputations) {
      if (plan.remainingBalance.greaterThan(ZERO_MONEY) && plan.status !== InstallmentPlanStatus.CANCELLED) {
        outstandingCustomerIds.add(plan.record.customer.id);
      }
    }

    const paymentsToday = this.paymentTotalForDateRange(records.payments, businessDate, businessDate);
    const paymentsThisMonth = this.paymentTotalForDateRange(records.payments, monthStart, businessDate);
    const obligationsCreatedToday = this.obligationCreatedTotal(records.debts, records.plans, businessDate);
    const obligationsCreatedThisMonth = this.obligationCreatedTotal(
      records.debts,
      records.plans,
      monthStart,
      businessDate
    );

    return {
      businessDate,
      monthStart,
      counts: {
        totalCustomers: records.totalCustomers,
        customersWithOutstanding: outstandingCustomerIds.size,
      },
      money: {
        totalOutstanding: moneyToApiString(
          sumMoney([
            ...debtComputations.map((debt) => debt.remainingBalance),
            ...planComputations.map((plan) => plan.remainingBalance),
          ])
        ),
        paymentsToday: moneyToApiString(paymentsToday),
        paymentsThisMonth: moneyToApiString(paymentsThisMonth),
        obligationsCreatedToday: moneyToApiString(obligationsCreatedToday),
        obligationsCreatedThisMonth: moneyToApiString(obligationsCreatedThisMonth),
        netChangeToday: moneyToApiString(subtractMoney(obligationsCreatedToday, paymentsToday)),
        netChangeThisMonth: moneyToApiString(subtractMoney(obligationsCreatedThisMonth, paymentsThisMonth)),
      },
      upcomingDue: this.upcomingDue(debtComputations, planComputations, businessDate),
      overdueCustomers: this.overdueCustomers(debtComputations, planComputations),
      recentPayments: this.recentPayments(records.payments),
    };
  }

  private static computeDebt(debt: DashboardDebtRecord, businessDate: string): DebtComputation {
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
    });

    return {
      record: debt,
      dueDate,
      remainingBalance: balance.remainingBalance,
      status,
    };
  }

  private static computePlan(plan: DashboardPlanRecord, businessDate: string): PlanComputation {
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

      return {
        plan,
        installment,
        dueDate,
        remainingBalance: balance.remainingBalance,
        status: determineInstallmentStatus({
          isCancelled: planIsCancelled || installment.status === InstallmentStatus.CANCELLED,
          dueDate,
          businessDate,
          balance,
        }),
      };
    });
    const summary = calculateInstallmentPlanSummary(
      {
        totalAmount: plan.totalAmount,
        installments: plan.installments.map((installment) => ({
          dueDate: prismaDateToBusinessDate(installment.dueDate),
          amountDue: installment.amountDue,
          status: installment.status,
          allocations: installment.paymentAllocations.map((allocation) => ({
            amount: allocation.amount,
            isVoided: isPaymentAllocationVoided(allocation),
          })),
        })),
      },
      businessDate
    );
    const status = determineInstallmentPlanStatus({
      isCancelled: planIsCancelled,
      installments: installments.map((installment) => ({ status: installment.status })),
    });

    return {
      record: plan,
      remainingBalance: summary.remainingBalance,
      status,
      installments,
    };
  }

  private static paymentTotalForDateRange(
    payments: DashboardPaymentRecord[],
    fromBusinessDate: string,
    toBusinessDate: string
  ): Decimal {
    return sumMoney(
      payments
        .filter((payment) => {
          const paymentDate = prismaDateToBusinessDate(payment.paymentDate);
          return (
            compareBusinessDates(paymentDate, fromBusinessDate) >= 0 &&
            compareBusinessDates(paymentDate, toBusinessDate) <= 0
          );
        })
        .map((payment) => payment.totalAmount)
    );
  }

  private static obligationCreatedTotal(
    debts: DashboardDebtRecord[],
    plans: DashboardPlanRecord[],
    fromBusinessDate: string,
    toBusinessDate = fromBusinessDate
  ): Decimal {
    return sumMoney([
      ...debts
        .filter((debt) => this.createdWithinRange(debt.createdAt, fromBusinessDate, toBusinessDate))
        .map((debt) => debt.originalAmount),
      ...plans
        .filter((plan) => this.createdWithinRange(plan.createdAt, fromBusinessDate, toBusinessDate))
        .map((plan) => plan.totalAmount),
    ]);
  }

  private static createdWithinRange(createdAt: Date, fromBusinessDate: string, toBusinessDate: string): boolean {
    const createdBusinessDate = todayInBusinessTimezone(undefined, createdAt);
    return (
      compareBusinessDates(createdBusinessDate, fromBusinessDate) >= 0 &&
      compareBusinessDates(createdBusinessDate, toBusinessDate) <= 0
    );
  }

  private static upcomingDue(
    debts: DebtComputation[],
    plans: PlanComputation[],
    businessDate: string
  ): DashboardUpcomingDueItem[] {
    const debtItems: DashboardUpcomingDueItem[] = debts
      .filter(
        (debt) =>
          debt.remainingBalance.greaterThan(ZERO_MONEY) &&
          debt.status !== DebtStatus.CANCELLED &&
          compareBusinessDates(debt.dueDate, businessDate) >= 0
      )
      .map((debt) => ({
        type: 'DEBT',
        id: debt.record.id,
        parentId: null,
        customer: debt.record.customer,
        description: debt.record.description,
        dueDate: debt.dueDate,
        remainingAmount: moneyToApiString(debt.remainingBalance),
        status: debt.status,
      }));
    const installmentItems: DashboardUpcomingDueItem[] = plans.flatMap((plan) =>
      plan.installments
        .filter(
          (installment) =>
            installment.remainingBalance.greaterThan(ZERO_MONEY) &&
            installment.status !== InstallmentStatus.CANCELLED &&
            compareBusinessDates(installment.dueDate, businessDate) >= 0
        )
        .map((installment) => ({
          type: 'INSTALLMENT' as const,
          id: installment.installment.id,
          parentId: plan.record.id,
          customer: plan.record.customer,
          description: plan.record.description,
          dueDate: installment.dueDate,
          remainingAmount: moneyToApiString(installment.remainingBalance),
          status: installment.status,
        }))
    );

    return [...debtItems, ...installmentItems]
      .sort((left, right) =>
        left.dueDate === right.dueDate ? left.id.localeCompare(right.id) : left.dueDate.localeCompare(right.dueDate)
      )
      .slice(0, 5);
  }

  private static overdueCustomers(
    debts: DebtComputation[],
    plans: PlanComputation[]
  ): DashboardOverdueCustomer[] {
    const byCustomer = new Map<string, DashboardOverdueCustomer>();
    const addOverdue = (
      customer: DashboardOverdueCustomer['customer'],
      remainingAmount: Decimal
    ) => {
      const existing =
        byCustomer.get(customer.id) ??
        ({
          customer,
          overdueItemCount: 0,
          totalOverdue: '0.00',
        } satisfies DashboardOverdueCustomer);

      existing.overdueItemCount += 1;
      existing.totalOverdue = moneyToApiString(sumMoney([existing.totalOverdue, remainingAmount]));
      byCustomer.set(customer.id, existing);
    };

    for (const debt of debts) {
      if (debt.status === DebtStatus.OVERDUE && debt.remainingBalance.greaterThan(ZERO_MONEY)) {
        addOverdue(debt.record.customer, debt.remainingBalance);
      }
    }
    for (const plan of plans) {
      for (const installment of plan.installments) {
        if (installment.status === InstallmentStatus.OVERDUE && installment.remainingBalance.greaterThan(ZERO_MONEY)) {
          addOverdue(plan.record.customer, installment.remainingBalance);
        }
      }
    }

    return Array.from(byCustomer.values())
      .sort((left, right) => {
        const amountComparison = new Decimal(right.totalOverdue).comparedTo(new Decimal(left.totalOverdue));
        return amountComparison === 0 ? left.customer.name.localeCompare(right.customer.name) : amountComparison;
      })
      .slice(0, 5);
  }

  private static recentPayments(payments: DashboardPaymentRecord[]): DashboardRecentPayment[] {
    return payments.slice(0, 5).map((payment) => ({
      id: payment.id,
      customer: payment.customer,
      amount: moneyToApiString(payment.totalAmount),
      paymentDate: prismaDateToBusinessDate(payment.paymentDate),
      paymentMethod: payment.paymentMethod,
      reference: payment.reference,
      allocationCount: payment.allocations.length,
    }));
  }
}
