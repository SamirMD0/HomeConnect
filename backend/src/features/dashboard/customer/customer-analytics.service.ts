import { DebtKind, DebtStatus, InstallmentPlanStatus, InstallmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  calculateDebtBalance,
  calculateInstallmentBalance,
  calculateInstallmentPlanSummary,
  determineDebtStatus,
  determineInstallmentStatus,
  isPaymentAllocationVoided,
  moneyToApiString,
  prismaDateToBusinessDate,
  subtractMoney,
  sumMoney,
  todayInBusinessTimezone,
  ZERO_MONEY,
} from '../../financial';
import { DASHBOARD_TOP_RECORD_LIMIT } from '../dashboard.config';
import type { ResolvedDashboardRange } from '../dashboard.types';
import { addDays, differenceInDays } from '../shared/dashboard-range';
import {
  CustomerAnalyticsRepository,
  type CustomerAnalyticsDebt,
  type CustomerAnalyticsPlan,
  type CustomerAnalyticsRecords,
} from './customer-analytics.repository';
import type {
  CustomerAgeBucket,
  CustomerAnalyticsData,
  CustomerMonthlyPoint,
  CustomerTrendPoint,
} from './customer-analytics.types';

interface OpenItem {
  customer: { id: string; name: string; phone: string };
  dueDate: string;
  remaining: Decimal;
  overdue: boolean;
}

export class CustomerAnalyticsService {
  static async get(
    range: ResolvedDashboardRange,
    options: { includeArchived: boolean; includeAdminData: boolean; businessDate?: string }
  ): Promise<CustomerAnalyticsData> {
    const businessDate = options.businessDate ?? todayInBusinessTimezone();
    const historyFrom = earliestDate(range.previousFrom, monthStartOffset(businessDate, -5));
    const records = await CustomerAnalyticsRepository.load(
      range,
      historyFrom,
      options.includeArchived
    );
    return this.aggregate(records, range, businessDate, options.includeAdminData);
  }

  static aggregate(
    records: CustomerAnalyticsRecords,
    range: ResolvedDashboardRange,
    businessDate: string,
    includeAdminData: boolean
  ): CustomerAnalyticsData {
    const openItems = [
      ...records.debts.flatMap((record) => this.debtItem(record, businessDate)),
      ...records.plans.flatMap((record) => this.planItems(record, businessDate)),
    ].filter((item) => item.remaining.greaterThan(ZERO_MONEY));

    const rangePayments = records.payments.filter((payment) =>
      inRange(prismaDateToBusinessDate(payment.paymentDate), range.from, range.to)
    );
    const rangeDebts = records.debts.filter((debt) =>
      inRange(createdBusinessDate(debt.createdAt), range.from, range.to)
    );
    const rangePlans = records.plans.filter((plan) =>
      inRange(createdBusinessDate(plan.createdAt), range.from, range.to)
    );
    const collected = sumMoney(rangePayments.map((payment) => payment.totalAmount));
    const newDebt = sumMoney([
      ...rangeDebts.filter(notCancelledDebt).map((debt) => debt.originalAmount),
      ...rangePlans.filter(notCancelledPlan).map((plan) => plan.totalAmount),
    ]);
    const outstanding = sumMoney(openItems.map((item) => item.remaining));
    const todayPayments = records.payments.filter(
      (payment) => prismaDateToBusinessDate(payment.paymentDate) === businessDate
    );
    const todayDebt = sumMoney([
      ...records.debts
        .filter((debt) => createdBusinessDate(debt.createdAt) === businessDate && notCancelledDebt(debt))
        .map((debt) => debt.originalAmount),
      ...records.plans
        .filter((plan) => createdBusinessDate(plan.createdAt) === businessDate && notCancelledPlan(plan))
        .map((plan) => plan.totalAmount),
    ]);
    const byCustomer = groupOutstanding(openItems);
    const overdueCustomers = new Set(openItems.filter((item) => item.overdue).map((item) => item.customer.id));

    const result: CustomerAnalyticsData = {
      totals: {
        totalCustomers: records.totalCustomers,
        collected: moneyToApiString(collected),
        distinctPayers: new Set(rangePayments.map((payment) => payment.customerId)).size,
        newDebt: moneyToApiString(newDebt),
        outstanding: moneyToApiString(outstanding),
        customersWithBalance: byCustomer.size,
        overdueCustomers: overdueCustomers.size,
        netMovement: moneyToApiString(subtractMoney(newDebt, collected)),
      },
      today: {
        collected: moneyToApiString(sumMoney(todayPayments.map((payment) => payment.totalAmount))),
        distinctPayers: new Set(todayPayments.map((payment) => payment.customerId)).size,
        newDebt: moneyToApiString(todayDebt),
      },
      trend: buildTrend(records, range),
      monthlyComparison: buildMonthlyComparison(records, businessDate),
      ageDistribution: buildAgeDistribution(openItems, businessDate),
    };

    if (includeAdminData) {
      result.topDebtors = [...byCustomer.entries()]
        .map(([customerId, value]) => ({
          customerId,
          customerName: value.customer.name,
          phone: value.customer.phone,
          outstanding: moneyToApiString(value.amount),
        }))
        .sort((left, right) => {
          const amountOrder = Number(right.outstanding) - Number(left.outstanding);
          return amountOrder || left.customerName.localeCompare(right.customerName) || left.customerId.localeCompare(right.customerId);
        })
        .slice(0, DASHBOARD_TOP_RECORD_LIMIT);
    }
    return result;
  }

  private static debtItem(record: CustomerAnalyticsDebt, businessDate: string): OpenItem[] {
    if (!notCancelledDebt(record)) return [];
    const balance = calculateDebtBalance({
      originalAmount: record.originalAmount,
      allocations: record.paymentAllocations.map((allocation) => ({
        amount: allocation.amount,
        isVoided: isPaymentAllocationVoided(allocation),
      })),
    });
    const dueDate = prismaDateToBusinessDate(record.dueDate);
    const status = determineDebtStatus({
      isCancelled: false,
      dueDate,
      businessDate,
      balance,
    });
    return [{ customer: record.customer, dueDate, remaining: balance.remainingBalance, overdue: status === DebtStatus.OVERDUE }];
  }

  private static planItems(record: CustomerAnalyticsPlan, businessDate: string): OpenItem[] {
    if (!notCancelledPlan(record)) return [];
    calculateInstallmentPlanSummary(
      {
        totalAmount: record.totalAmount,
        installments: record.installments.map((installment) => ({
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
    return record.installments.flatMap((installment) => {
      if (installment.status === InstallmentStatus.CANCELLED) return [];
      const balance = calculateInstallmentBalance({
        amountDue: installment.amountDue,
        allocations: installment.paymentAllocations.map((allocation) => ({
          amount: allocation.amount,
          isVoided: isPaymentAllocationVoided(allocation),
        })),
      });
      const dueDate = prismaDateToBusinessDate(installment.dueDate);
      const status = determineInstallmentStatus({ isCancelled: false, dueDate, businessDate, balance });
      return [{ customer: record.customer, dueDate, remaining: balance.remainingBalance, overdue: status === InstallmentStatus.OVERDUE }];
    });
  }
}

function buildTrend(records: CustomerAnalyticsRecords, range: ResolvedDashboardRange): CustomerTrendPoint[] {
  const buckets = bucketKeys(range.from, range.to, range.granularity);
  return buckets.map((bucket) => ({
    bucket,
    collected: moneyToApiString(
      sumMoney(records.payments.filter((p) => bucketFor(prismaDateToBusinessDate(p.paymentDate), range.granularity) === bucket).map((p) => p.totalAmount))
    ),
    newDebt: moneyToApiString(sumMoney([
      ...records.debts.filter((d) => notCancelledDebt(d) && bucketFor(createdBusinessDate(d.createdAt), range.granularity) === bucket).map((d) => d.originalAmount),
      ...records.plans.filter((p) => notCancelledPlan(p) && bucketFor(createdBusinessDate(p.createdAt), range.granularity) === bucket).map((p) => p.totalAmount),
    ])),
  }));
}

function buildMonthlyComparison(records: CustomerAnalyticsRecords, businessDate: string): CustomerMonthlyPoint[] {
  return Array.from({ length: 6 }, (_, index) => monthStartOffset(businessDate, index - 5).slice(0, 7)).map((month) => ({
    month,
    collected: moneyToApiString(sumMoney(records.payments.filter((p) => prismaDateToBusinessDate(p.paymentDate).startsWith(month)).map((p) => p.totalAmount))),
    newDebt: moneyToApiString(sumMoney([
      ...records.debts.filter((d) => notCancelledDebt(d) && createdBusinessDate(d.createdAt).startsWith(month)).map((d) => d.originalAmount),
      ...records.plans.filter((p) => notCancelledPlan(p) && createdBusinessDate(p.createdAt).startsWith(month)).map((p) => p.totalAmount),
    ])),
  }));
}

function buildAgeDistribution(items: OpenItem[], businessDate: string): CustomerAgeBucket[] {
  const definitions: Array<{ key: CustomerAgeBucket['key']; label: string; min: number; max: number }> = [
    { key: 'CURRENT', label: 'Current', min: Number.NEGATIVE_INFINITY, max: 0 },
    { key: 'DAYS_1_30', label: '1–30 days', min: 1, max: 30 },
    { key: 'DAYS_31_60', label: '31–60 days', min: 31, max: 60 },
    { key: 'DAYS_61_90', label: '61–90 days', min: 61, max: 90 },
    { key: 'DAYS_90_PLUS', label: '90+ days', min: 91, max: Number.POSITIVE_INFINITY },
  ];
  return definitions.map((definition) => {
    const matching = items.filter((item) => {
      const age = differenceInDays(item.dueDate, businessDate);
      return age >= definition.min && age <= definition.max;
    });
    return { ...definition, amount: moneyToApiString(sumMoney(matching.map((item) => item.remaining))), count: matching.length };
  }).map(({ min: _min, max: _max, ...bucket }) => bucket);
}

function groupOutstanding(items: OpenItem[]) {
  const grouped = new Map<string, { customer: OpenItem['customer']; amount: Decimal }>();
  for (const item of items) {
    const existing = grouped.get(item.customer.id);
    grouped.set(item.customer.id, { customer: item.customer, amount: sumMoney([existing?.amount ?? ZERO_MONEY, item.remaining]) });
  }
  return grouped;
}

function bucketKeys(from: string, to: string, granularity: ResolvedDashboardRange['granularity']): string[] {
  const keys: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    const key = bucketFor(cursor, granularity);
    if (keys.at(-1) !== key) keys.push(key);
  }
  return keys;
}

function bucketFor(date: string, granularity: ResolvedDashboardRange['granularity']): string {
  if (granularity === 'day') return date;
  if (granularity === 'month') return date.slice(0, 7);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -(weekday === 0 ? 6 : weekday - 1));
}

function createdBusinessDate(date: Date): string {
  return todayInBusinessTimezone(undefined, date);
}

function inRange(value: string, from: string, to: string): boolean {
  return value >= from && value <= to;
}

function notCancelledDebt(record: Pick<CustomerAnalyticsDebt, 'kind' | 'status' | 'cancelledAt'>): boolean {
  return record.kind !== DebtKind.PREPAID_PURCHASE && record.status !== DebtStatus.CANCELLED && !record.cancelledAt;
}

function notCancelledPlan(record: Pick<CustomerAnalyticsPlan, 'status' | 'cancelledAt'>): boolean {
  return record.status !== InstallmentPlanStatus.CANCELLED && !record.cancelledAt;
}

function monthStartOffset(value: string, offset: number): string {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

function earliestDate(...values: string[]): string {
  return [...values].sort()[0];
}
