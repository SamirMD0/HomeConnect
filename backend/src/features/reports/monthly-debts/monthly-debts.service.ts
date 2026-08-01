import { Decimal } from '@prisma/client/runtime/library';
import { DebtKind } from '@prisma/client';
import {
  businessDateToPrisma,
  compareBusinessDates,
  moneyToApiString,
  parseBusinessDate,
  prismaDateToBusinessDate,
  splitBusinessDate,
  subtractMoney,
  sumMoney,
  ZERO_MONEY,
} from '../../financial';
import {
  MonthlyActivityDebtRecord,
  MonthlyActivityPaymentRecord,
  MonthlyActivityPlanRecord,
  MonthlyDebtRecord,
  MonthlyDebtsRepository,
  MonthlyInstallmentPlanRecord,
  MonthlyPaymentRecord,
} from './monthly-debts.repository';
import {
  MonthlyDebtReport,
  MonthlyDebtReportRow,
  MonthlyFinancialActivityItem,
  MonthlyFinancialActivityReport,
} from './monthly-debts.types';
import {
  monthToBusinessRange,
  MonthlyDebtCsvQueryInput,
  MonthlyDebtReportQueryInput,
  MonthlyFinancialActivityQueryInput,
} from './monthly-debts.validator';

interface MonthBoundaries {
  month: string;
  startDate: string;
  endDate: string;
  startDatePrisma: Date;
  endDatePrisma: Date;
  nextDayAfterEnd: Date;
}

interface CustomerBucket {
  customer: MonthlyDebtReportRow['customer'];
  singleDebtOutstanding: Decimal;
  installmentPlanOutstanding: Decimal;
  amountDueByCutoff: Decimal;
  overdueAmountAtCutoff: Decimal;
  activeDebtCount: number;
  activePlanCount: number;
  overdueDebtCount: number;
  overdueInstallmentCount: number;
  lastPaymentDate: string | null;
  nextDueDateAfterCutoff: string | null;
}

export class MonthlyDebtsService {
  static async getMonthlyDebtReport(query: MonthlyDebtReportQueryInput): Promise<MonthlyDebtReport> {
    const report = await this.buildMonthlyDebtReport(query, false);
    return report;
  }

  static async getMonthlyDebtCsv(query: MonthlyDebtCsvQueryInput) {
    const report = await this.buildMonthlyDebtReport({ ...query, page: 1, limit: 10000 }, true);
    const csv = this.toCsv(report.rows);

    return {
      filename: `monthly-debts-${query.month}.csv`,
      csv,
    };
  }

  static async getMonthlyFinancialActivity(
    query: MonthlyFinancialActivityQueryInput
  ): Promise<MonthlyFinancialActivityReport> {
    const boundaries = this.monthBoundaries(query.month);
    const records = await MonthlyDebtsRepository.loadActivityRecords({
      customerId: query.customerId,
      startDate: boundaries.startDatePrisma,
      endDate: boundaries.endDatePrisma,
      nextDayAfterEnd: boundaries.nextDayAfterEnd,
    });

    const standardDebts = records.debts.filter((debt) => debt.kind !== DebtKind.PREPAID_PURCHASE);
    const validPayments = records.payments.filter((payment) =>
      this.paymentValidAtCutoff(payment, boundaries.nextDayAfterEnd)
    );
    const items = [
      ...standardDebts.map((debt) => this.activityDebtItem(debt)),
      ...records.plans.map((plan) => this.activityPlanItem(plan)),
      ...validPayments.map((payment) => this.activityPaymentItem(payment)),
    ].sort((left, right) => {
      const dateComparison = left.date.localeCompare(right.date);
      if (dateComparison !== 0) return dateComparison;
      return left.id.localeCompare(right.id);
    });

    const newSingleDebtAmount = sumMoney(standardDebts.map((debt) => debt.originalAmount));
    const newInstallmentPlanAmount = sumMoney(records.plans.map((plan) => plan.totalAmount));
    const paymentsReceived = sumMoney(validPayments.map((payment) => payment.totalAmount));
    const netFinancialChange = subtractMoney(
      sumMoney([newSingleDebtAmount, newInstallmentPlanAmount]),
      paymentsReceived
    );
    const affectedCustomerIds = new Set<string>([
      ...standardDebts.map((debt) => debt.customer.id),
      ...records.plans.map((plan) => plan.customer.id),
      ...validPayments.map((payment) => payment.customer.id),
    ]);

    const page = query.page;
    const limit = query.limit;
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pagedItems = items.slice((page - 1) * limit, page * limit);

    return {
      summary: {
        month: boundaries.month,
        startDate: boundaries.startDate,
        endDate: boundaries.endDate,
        newSingleDebtAmount: moneyToApiString(newSingleDebtAmount),
        newInstallmentPlanAmount: moneyToApiString(newInstallmentPlanAmount),
        paymentsReceived: moneyToApiString(paymentsReceived),
        netFinancialChange: moneyToApiString(netFinancialChange),
        debtsCreated: standardDebts.length,
        plansCreated: records.plans.length,
        payments: validPayments.length,
        customerCountAffected: affectedCustomerIds.size,
      },
      items: pagedItems,
      pagination: { page, limit, total, totalPages },
    };
  }

  private static async buildMonthlyDebtReport(
    query: MonthlyDebtReportQueryInput,
    includeCompleteDataset: boolean
  ): Promise<MonthlyDebtReport> {
    const boundaries = this.monthBoundaries(query.month);
    const records = await MonthlyDebtsRepository.loadSnapshotRecords({
      search: query.search,
      startDate: boundaries.startDatePrisma,
      cutoffDate: boundaries.endDatePrisma,
      nextDayAfterCutoff: boundaries.nextDayAfterEnd,
    });
    const buckets = new Map<string, CustomerBucket>();

    for (const payment of records.paymentsThroughCutoff) {
      if (!this.paymentValidAtCutoff(payment, boundaries.nextDayAfterEnd)) continue;
      const bucket = this.getBucket(buckets, payment.customer);
      const paymentDate = prismaDateToBusinessDate(payment.paymentDate);
      if (!bucket.lastPaymentDate || compareBusinessDates(paymentDate, bucket.lastPaymentDate) > 0) {
        bucket.lastPaymentDate = paymentDate;
      }
    }

    for (const debt of records.debts) {
      this.applyDebtToBuckets(buckets, debt, boundaries, query.includeCancelled);
    }

    for (const plan of records.plans) {
      this.applyPlanToBuckets(buckets, plan, boundaries, query.includeCancelled);
    }

    const rows = Array.from(buckets.values())
      .map((bucket) => this.bucketToRow(bucket))
      .filter((row) => query.includeZero || new Decimal(row.totalOutstanding).greaterThan(ZERO_MONEY))
      .filter(
        (row) => !query.overdueOnly || new Decimal(row.overdueAmountAtCutoff).greaterThan(ZERO_MONEY)
      )
      .sort((left, right) => this.compareRows(left, right, query.sortBy, query.sortOrder));

    const summaryRows = rows;
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    const pageRows = includeCompleteDataset
      ? rows
      : rows.slice((query.page - 1) * query.limit, query.page * query.limit);
    const monthlyPaymentsTotal = this.sumUniqueValidPayments(
      records.monthlyPayments,
      boundaries.nextDayAfterEnd
    );

    return {
      mode: 'SNAPSHOT',
      summary: {
        month: boundaries.month,
        cutoffDate: boundaries.endDate,
        customerCount: summaryRows.length,
        totalOutstanding: moneyToApiString(
          sumMoney(summaryRows.map((row) => row.totalOutstanding))
        ),
        singleDebtOutstandingTotal: moneyToApiString(
          sumMoney(summaryRows.map((row) => row.singleDebtOutstanding))
        ),
        installmentPlanOutstandingTotal: moneyToApiString(
          sumMoney(summaryRows.map((row) => row.installmentPlanOutstanding))
        ),
        totalAmountDueByCutoff: moneyToApiString(
          sumMoney(summaryRows.map((row) => row.amountDueByCutoff))
        ),
        totalOverdueAtCutoff: moneyToApiString(
          sumMoney(summaryRows.map((row) => row.overdueAmountAtCutoff))
        ),
        totalPaymentsReceivedDuringMonth: moneyToApiString(monthlyPaymentsTotal),
        customersWithOverdueDebt: summaryRows.filter((row) =>
          new Decimal(row.overdueAmountAtCutoff).greaterThan(ZERO_MONEY)
        ).length,
        customersWithActiveInstallmentPlans: summaryRows.filter((row) => row.activePlanCount > 0)
          .length,
      },
      rows: pageRows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
      },
    };
  }

  private static applyDebtToBuckets(
    buckets: Map<string, CustomerBucket>,
    debt: MonthlyDebtRecord,
    boundaries: MonthBoundaries,
    includeCancelled: boolean
  ) {
    if (debt.kind === DebtKind.PREPAID_PURCHASE) return;
    const cancelledByCutoff = this.cancelledOnOrBeforeCutoff(debt.cancelledAt, boundaries.nextDayAfterEnd);
    if (cancelledByCutoff && !includeCancelled) return;

    const bucket = this.getBucket(buckets, debt.customer);
    if (cancelledByCutoff) return;

    const totalPaidAtCutoff = this.sumValidAllocationsAtCutoff(
      debt.paymentAllocations,
      boundaries.endDate,
      boundaries.nextDayAfterEnd
    );
    const remaining = this.nonNegative(subtractMoney(debt.originalAmount, totalPaidAtCutoff));
    if (!remaining.greaterThan(ZERO_MONEY)) return;

    const dueDate = prismaDateToBusinessDate(debt.dueDate);
    bucket.singleDebtOutstanding = sumMoney([bucket.singleDebtOutstanding, remaining]);
    bucket.activeDebtCount += 1;

    if (compareBusinessDates(dueDate, boundaries.endDate) <= 0) {
      bucket.amountDueByCutoff = sumMoney([bucket.amountDueByCutoff, remaining]);
    }
    if (compareBusinessDates(dueDate, boundaries.endDate) < 0) {
      bucket.overdueAmountAtCutoff = sumMoney([bucket.overdueAmountAtCutoff, remaining]);
      bucket.overdueDebtCount += 1;
    }
    if (compareBusinessDates(dueDate, boundaries.endDate) > 0) {
      bucket.nextDueDateAfterCutoff = this.earliestBusinessDate(bucket.nextDueDateAfterCutoff, dueDate);
    }
  }

  private static applyPlanToBuckets(
    buckets: Map<string, CustomerBucket>,
    plan: MonthlyInstallmentPlanRecord,
    boundaries: MonthBoundaries,
    includeCancelled: boolean
  ) {
    const cancelledByCutoff = this.cancelledOnOrBeforeCutoff(plan.cancelledAt, boundaries.nextDayAfterEnd);
    if (cancelledByCutoff && !includeCancelled) return;

    const bucket = this.getBucket(buckets, plan.customer);
    if (cancelledByCutoff) return;

    const totalPaidAtCutoff = sumMoney(
      plan.installments.map((installment) =>
        this.sumValidAllocationsAtCutoff(
          installment.paymentAllocations,
          boundaries.endDate,
          boundaries.nextDayAfterEnd
        )
      )
    );
    const remainingPlanBalance = this.nonNegative(subtractMoney(plan.totalAmount, totalPaidAtCutoff));
    if (!remainingPlanBalance.greaterThan(ZERO_MONEY)) return;

    bucket.installmentPlanOutstanding = sumMoney([
      bucket.installmentPlanOutstanding,
      remainingPlanBalance,
    ]);
    bucket.activePlanCount += 1;

    for (const installment of plan.installments) {
      const installmentPaid = this.sumValidAllocationsAtCutoff(
        installment.paymentAllocations,
        boundaries.endDate,
        boundaries.nextDayAfterEnd
      );
      const remainingInstallment = this.nonNegative(subtractMoney(installment.amountDue, installmentPaid));
      if (!remainingInstallment.greaterThan(ZERO_MONEY)) continue;

      const dueDate = prismaDateToBusinessDate(installment.dueDate);
      if (compareBusinessDates(dueDate, boundaries.endDate) <= 0) {
        bucket.amountDueByCutoff = sumMoney([bucket.amountDueByCutoff, remainingInstallment]);
      }
      if (compareBusinessDates(dueDate, boundaries.endDate) < 0) {
        bucket.overdueAmountAtCutoff = sumMoney([bucket.overdueAmountAtCutoff, remainingInstallment]);
        bucket.overdueInstallmentCount += 1;
      }
      if (compareBusinessDates(dueDate, boundaries.endDate) > 0) {
        bucket.nextDueDateAfterCutoff = this.earliestBusinessDate(bucket.nextDueDateAfterCutoff, dueDate);
      }
    }
  }

  private static sumValidAllocationsAtCutoff(
    allocations: Array<{ amount: Decimal; payment: { paymentDate: Date; voidedAt: Date | null } }>,
    cutoffDate: string,
    nextDayAfterCutoff: Date
  ) {
    return sumMoney(
      allocations
        .filter((allocation) => {
          const paymentDate = prismaDateToBusinessDate(allocation.payment.paymentDate);
          return (
            compareBusinessDates(paymentDate, cutoffDate) <= 0 &&
            this.paymentValidAtCutoff(allocation.payment, nextDayAfterCutoff)
          );
        })
        .map((allocation) => allocation.amount)
    );
  }

  private static sumUniqueValidPayments(payments: MonthlyPaymentRecord[], nextDayAfterCutoff: Date) {
    const seen = new Set<string>();
    const validPayments = payments.filter((payment) => {
      if (seen.has(payment.id)) return false;
      seen.add(payment.id);
      return this.paymentValidAtCutoff(payment, nextDayAfterCutoff);
    });

    return sumMoney(validPayments.map((payment) => payment.totalAmount));
  }

  private static paymentValidAtCutoff(
    payment: { voidedAt: Date | null },
    nextDayAfterCutoff: Date
  ): boolean {
    return !payment.voidedAt || payment.voidedAt >= nextDayAfterCutoff;
  }

  private static cancelledOnOrBeforeCutoff(cancelledAt: Date | null, nextDayAfterCutoff: Date): boolean {
    return Boolean(cancelledAt && cancelledAt < nextDayAfterCutoff);
  }

  private static bucketToRow(bucket: CustomerBucket): MonthlyDebtReportRow {
    const totalOutstanding = sumMoney([
      bucket.singleDebtOutstanding,
      bucket.installmentPlanOutstanding,
    ]);

    return {
      customer: bucket.customer,
      singleDebtOutstanding: moneyToApiString(bucket.singleDebtOutstanding),
      installmentPlanOutstanding: moneyToApiString(bucket.installmentPlanOutstanding),
      totalOutstanding: moneyToApiString(totalOutstanding),
      amountDueByCutoff: moneyToApiString(bucket.amountDueByCutoff),
      overdueAmountAtCutoff: moneyToApiString(bucket.overdueAmountAtCutoff),
      activeDebtCount: bucket.activeDebtCount,
      activePlanCount: bucket.activePlanCount,
      overdueDebtCount: bucket.overdueDebtCount,
      overdueInstallmentCount: bucket.overdueInstallmentCount,
      lastPaymentDate: bucket.lastPaymentDate,
      nextDueDateAfterCutoff: bucket.nextDueDateAfterCutoff,
    };
  }

  private static getBucket(
    buckets: Map<string, CustomerBucket>,
    customer: MonthlyDebtReportRow['customer']
  ) {
    const existing = buckets.get(customer.id);
    if (existing) return existing;

    const bucket: CustomerBucket = {
      customer,
      singleDebtOutstanding: ZERO_MONEY,
      installmentPlanOutstanding: ZERO_MONEY,
      amountDueByCutoff: ZERO_MONEY,
      overdueAmountAtCutoff: ZERO_MONEY,
      activeDebtCount: 0,
      activePlanCount: 0,
      overdueDebtCount: 0,
      overdueInstallmentCount: 0,
      lastPaymentDate: null,
      nextDueDateAfterCutoff: null,
    };
    buckets.set(customer.id, bucket);
    return bucket;
  }

  private static compareRows(
    left: MonthlyDebtReportRow,
    right: MonthlyDebtReportRow,
    sortBy: MonthlyDebtReportQueryInput['sortBy'],
    sortOrder: MonthlyDebtReportQueryInput['sortOrder']
  ) {
    const direction = sortOrder === 'ASC' ? 1 : -1;
    let comparison = 0;

    if (sortBy === 'CUSTOMER') {
      comparison = left.customer.name.localeCompare(right.customer.name);
    } else if (sortBy === 'OVERDUE') {
      comparison = new Decimal(left.overdueAmountAtCutoff).comparedTo(right.overdueAmountAtCutoff);
    } else if (sortBy === 'LAST_PAYMENT') {
      comparison = (left.lastPaymentDate ?? '').localeCompare(right.lastPaymentDate ?? '');
    } else {
      comparison = new Decimal(left.totalOutstanding).comparedTo(right.totalOutstanding);
    }

    if (comparison === 0) comparison = left.customer.name.localeCompare(right.customer.name);
    if (comparison === 0) comparison = left.customer.id.localeCompare(right.customer.id);
    return comparison * direction;
  }

  private static activityDebtItem(debt: MonthlyActivityDebtRecord): MonthlyFinancialActivityItem {
    return {
      id: debt.id,
      customer: debt.customer,
      type: 'DEBT_CREATED',
      date: prismaDateToBusinessDate(debt.createdAt),
      description: debt.description,
      amount: moneyToApiString(debt.originalAmount),
    };
  }

  private static activityPlanItem(plan: MonthlyActivityPlanRecord): MonthlyFinancialActivityItem {
    return {
      id: plan.id,
      customer: plan.customer,
      type: 'INSTALLMENT_PLAN_CREATED',
      date: prismaDateToBusinessDate(plan.createdAt),
      description: plan.description,
      amount: moneyToApiString(plan.totalAmount),
    };
  }

  private static activityPaymentItem(payment: MonthlyActivityPaymentRecord): MonthlyFinancialActivityItem {
    return {
      id: payment.id,
      customer: payment.customer,
      type: 'PAYMENT_RECEIVED',
      date: prismaDateToBusinessDate(payment.paymentDate),
      description: payment.reference || 'Payment received',
      amount: moneyToApiString(payment.totalAmount),
    };
  }

  private static monthBoundaries(month: string): MonthBoundaries {
    const range = monthToBusinessRange(month);
    parseBusinessDate(range.startDate);
    parseBusinessDate(range.endDate);

    return {
      ...range,
      startDatePrisma: businessDateToPrisma(range.startDate),
      endDatePrisma: businessDateToPrisma(range.endDate),
      nextDayAfterEnd: this.nextBusinessDayDate(range.endDate),
    };
  }

  private static nextBusinessDayDate(input: string): Date {
    const { year, month, day } = splitBusinessDate(input);
    return new Date(Date.UTC(year, month - 1, day + 1));
  }

  private static earliestBusinessDate(current: string | null, candidate: string): string {
    if (!current) return candidate;
    return compareBusinessDates(candidate, current) < 0 ? candidate : current;
  }

  private static nonNegative(value: Decimal): Decimal {
    return value.lessThan(ZERO_MONEY) ? ZERO_MONEY : value;
  }

  private static toCsv(rows: MonthlyDebtReportRow[]): string {
    const headers = [
      'Customer Name',
      'Phone',
      'Single Debt Outstanding',
      'Installment Plan Outstanding',
      'Total Outstanding',
      'Due By Cutoff',
      'Overdue At Cutoff',
      'Active Debt Count',
      'Active Plan Count',
      'Overdue Debt Count',
      'Overdue Installment Count',
      'Last Payment Date',
      'Next Due Date After Cutoff',
    ];
    const body = rows.map((row) => [
      row.customer.name,
      row.customer.phone,
      row.singleDebtOutstanding,
      row.installmentPlanOutstanding,
      row.totalOutstanding,
      row.amountDueByCutoff,
      row.overdueAmountAtCutoff,
      String(row.activeDebtCount),
      String(row.activePlanCount),
      String(row.overdueDebtCount),
      String(row.overdueInstallmentCount),
      row.lastPaymentDate ?? '',
      row.nextDueDateAfterCutoff ?? '',
    ]);

    return `\uFEFF${[headers, ...body].map((row) => row.map(this.escapeCsvValue).join(',')).join('\r\n')}\r\n`;
  }

  private static escapeCsvValue(value: string): string {
    if (/[",\r\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
