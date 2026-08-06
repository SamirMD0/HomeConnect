import { DebtKind, DebtStatus, InstallmentPlanStatus, InstallmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  businessDateToPrisma,
  calculateDebtBalance,
  calculateInstallmentBalance,
  calculateInstallmentPlanSummary,
  compareBusinessDates,
  daysInMonth,
  determineDebtStatus,
  determineInstallmentPlanStatus,
  determineInstallmentStatus,
  isPaymentAllocationVoided,
  moneyToApiString,
  parseMoney,
  prismaDateToBusinessDate,
  sumMoney,
  todayInBusinessTimezone,
  ZERO_MONEY,
} from '../../financial';
import {
  ReceivableCustomerRecord,
  ReceivableDebtRecord,
  ReceivablePaymentRecord,
  ReceivablePlanRecord,
  ReceivablesRepository,
} from './receivables.repository';
import { determineReceivableTier } from './receivables.tier';
import { ReceivablesQueryInput } from './receivables.validator';
import {
  ReceivableCustomerProjection,
  ReceivableItemView,
  ReceivablesResponseView,
  ReceivableTier,
  ReceivableTierCounts,
  ReceivablesSummaryView,
} from './receivables.types';
import { findSearchMatchIds } from '../../../lib/search-query';

const MILLISECONDS_PER_DAY = 86_400_000;

interface ReceivableComputation {
  item: ReceivableItemView;
  rank: number;
  outstanding: Decimal;
  overdueAmount: Decimal;
}

/**
 * Inclusive business-date window. When set, only obligations due inside it and
 * payments made inside it count towards a customer's figures.
 */
interface MonthRange {
  from: string;
  to: string;
}

export function monthToRange(month: string): MonthRange {
  const [yearPart, monthPart] = month.split('-');
  const lastDay = daysInMonth(Number(yearPart), Number(monthPart));
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function isWithinRange(businessDate: string, range: MonthRange | null): boolean {
  if (!range) return true;
  return (
    compareBusinessDates(businessDate, range.from) >= 0 &&
    compareBusinessDates(businessDate, range.to) <= 0
  );
}

export class ReceivablesService {
  static async getReceivables(query: ReceivablesQueryInput): Promise<ReceivablesResponseView> {
    const matchedIds = await findSearchMatchIds('customer', query.search);
    const matchedCustomerIds = matchedIds === null ? null : new Set(matchedIds);
    const records = await ReceivablesRepository.loadReceivableRecords({
      includeInactive: query.includeInactive,
    });
    const businessDate = todayInBusinessTimezone();
    const monthRange = query.month ? monthToRange(query.month) : null;

    const debtsByCustomer = groupBy(records.debts, (debt) => debt.customerId);
    const plansByCustomer = groupBy(records.plans, (plan) => plan.customerId);
    const paymentsByCustomer = groupBy(records.payments, (payment) => payment.customerId);

    const computations = records.customers.map((customer) =>
      this.computeCustomer(
        customer,
        debtsByCustomer.get(customer.id) ?? [],
        plansByCustomer.get(customer.id) ?? [],
        paymentsByCustomer.get(customer.id) ?? [],
        businessDate,
        monthRange
      )
    );

    const baseFiltered = computations.filter((computation) =>
      this.matchesBaseFilters(computation, query, matchedCustomerIds)
    );
    // Tier counts intentionally ignore the tier filter so the filter chips keep
    // showing how many customers sit in each tier while a tier is selected.
    const tierCounts = this.countTiers(baseFiltered);
    const filtered =
      query.tier.length > 0
        ? baseFiltered.filter((computation) => query.tier.includes(computation.item.tier))
        : baseFiltered;

    const sorted = this.sortComputations(filtered, query);
    const total = sorted.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
    const start = (query.page - 1) * query.limit;
    const items = sorted.slice(start, start + query.limit).map((computation) => computation.item);

    return {
      businessDate,
      summary: this.buildSummary(filtered),
      tierCounts,
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Financial figures for a specific set of customers, keyed by customer id.
   *
   * This exists so a list screen can show outstanding/overdue/next-due beside a
   * name with ONE request instead of one request per row, while still getting
   * its numbers from the same computation that powers the receivables page.
   *
   * Two deliberate differences from `getReceivables`:
   *   * inactive customers are included — the caller has already decided which
   *     customers it is showing, and a projection that silently omitted one
   *     would render a blank money column rather than the truth;
   *   * no month scoping — these are lifetime figures, matching what the
   *     customer profile shows.
   *
   * Customers with no financial records still get an entry (all zeros,
   * NO_ACTIVITY), so callers never have to distinguish "owes nothing" from
   * "missing from the map".
   */
  static async computeReceivableProjections(params: {
    customerIds: string[];
  }): Promise<Map<string, ReceivableCustomerProjection>> {
    const projections = new Map<string, ReceivableCustomerProjection>();
    if (params.customerIds.length === 0) return projections;

    const records = await ReceivablesRepository.loadReceivableRecords({
      includeInactive: true,
      customerIds: params.customerIds,
    });
    const businessDate = todayInBusinessTimezone();

    const debtsByCustomer = groupBy(records.debts, (debt) => debt.customerId);
    const plansByCustomer = groupBy(records.plans, (plan) => plan.customerId);
    const paymentsByCustomer = groupBy(records.payments, (payment) => payment.customerId);

    for (const customer of records.customers) {
      const { item } = this.computeCustomer(
        customer,
        debtsByCustomer.get(customer.id) ?? [],
        plansByCustomer.get(customer.id) ?? [],
        paymentsByCustomer.get(customer.id) ?? [],
        businessDate,
        null
      );

      projections.set(customer.id, {
        customerId: customer.id,
        tier: item.tier,
        tierReason: item.tierReason,
        totalObligated: item.totalObligated,
        totalPaid: item.totalPaid,
        outstanding: item.outstanding,
        overdueAmount: item.overdueAmount,
        openDebtCount: item.openDebtCount,
        activePlanCount: item.activePlanCount,
        overdueItemCount: item.overdueItemCount,
        maxOverdueDays: item.maxOverdueDays,
        nextDueDate: item.nextDueDate,
        lastPaymentDate: item.lastPaymentDate,
        daysSinceLastPayment: item.daysSinceLastPayment,
      });
    }

    return projections;
  }

  private static computeCustomer(
    customer: ReceivableCustomerRecord,
    allDebts: ReceivableDebtRecord[],
    plans: ReceivablePlanRecord[],
    allPayments: ReceivablePaymentRecord[],
    businessDate: string,
    monthRange: MonthRange | null
  ): ReceivableComputation {
    const debts = monthRange
      ? allDebts.filter((debt) =>
          isWithinRange(prismaDateToBusinessDate(debt.dueDate), monthRange)
        )
      : allDebts;
    const payments = monthRange
      ? allPayments.filter((payment) =>
          isWithinRange(prismaDateToBusinessDate(payment.paymentDate), monthRange)
        )
      : allPayments;
    const obligatedAmounts: Decimal[] = [];
    const paidAmounts: Decimal[] = [];
    const outstandingAmounts: Decimal[] = [];
    const overdueAmounts: Decimal[] = [];
    const overdueDueDates: string[] = [];
    const nextDueDates: string[] = [];

    let billsTotal = 0;
    let billsPaid = 0;
    let openDebtCount = 0;
    let activePlanCount = 0;
    let overdueItemCount = 0;

    for (const debt of debts) {
      if (debt.kind === DebtKind.PREPAID_PURCHASE) continue;

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

      billsTotal += 1;
      if (balance.isFullyPaid) billsPaid += 1;

      obligatedAmounts.push(parseMoney(debt.originalAmount));
      paidAmounts.push(balance.totalPaid);
      outstandingAmounts.push(balance.remainingBalance);

      if (balance.remainingBalance.greaterThan(ZERO_MONEY)) {
        openDebtCount += 1;
        nextDueDates.push(dueDate);

        if (status === DebtStatus.OVERDUE) {
          overdueItemCount += 1;
          overdueAmounts.push(balance.remainingBalance);
          overdueDueDates.push(dueDate);
        }
      }
    }

    for (const plan of plans) {
      const planIsCancelled =
        plan.status === InstallmentPlanStatus.CANCELLED || Boolean(plan.cancelledAt);
      // Plan status is a property of the whole plan, so it always considers every
      // non-cancelled installment, even when the month filter narrows the figures.
      const installmentStatuses: Array<{ status: InstallmentStatus }> = [];
      const scopedObligated: Decimal[] = [];
      const scopedPaid: Decimal[] = [];
      const scopedOutstanding: Decimal[] = [];
      let scopedInstallmentCount = 0;

      for (const installment of plan.installments) {
        if (installment.status === InstallmentStatus.CANCELLED) continue;

        const balance = calculateInstallmentBalance({
          amountDue: installment.amountDue,
          allocations: installment.paymentAllocations.map((allocation) => ({
            amount: allocation.amount,
            isVoided: isPaymentAllocationVoided(allocation),
          })),
        });
        const dueDate = prismaDateToBusinessDate(installment.dueDate);
        const status = determineInstallmentStatus({
          isCancelled: planIsCancelled,
          dueDate,
          businessDate,
          balance,
        });

        installmentStatuses.push({ status });

        if (!isWithinRange(dueDate, monthRange)) continue;

        scopedInstallmentCount += 1;
        scopedObligated.push(parseMoney(installment.amountDue));
        scopedPaid.push(balance.totalPaid);
        scopedOutstanding.push(balance.remainingBalance);

        billsTotal += 1;
        if (balance.isFullyPaid) billsPaid += 1;

        if (balance.remainingBalance.greaterThan(ZERO_MONEY)) {
          nextDueDates.push(dueDate);

          if (status === InstallmentStatus.OVERDUE) {
            overdueItemCount += 1;
            overdueAmounts.push(balance.remainingBalance);
            overdueDueDates.push(dueDate);
          }
        }
      }

      if (monthRange && scopedInstallmentCount === 0) continue;

      const planStatus = determineInstallmentPlanStatus({
        isCancelled: planIsCancelled,
        installments: installmentStatuses,
      });

      if (
        planStatus === InstallmentPlanStatus.ACTIVE ||
        planStatus === InstallmentPlanStatus.OVERDUE
      ) {
        activePlanCount += 1;
      }

      if (monthRange) {
        // Only the installments falling inside the month contribute.
        obligatedAmounts.push(sumMoney(scopedObligated));
        paidAmounts.push(sumMoney(scopedPaid));
        outstandingAmounts.push(sumMoney(scopedOutstanding));
        continue;
      }

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

      obligatedAmounts.push(parseMoney(plan.totalAmount));
      paidAmounts.push(summary.totalPaid);
      outstandingAmounts.push(summary.remainingBalance);
    }

    const totalObligated = sumMoney(obligatedAmounts);
    const totalPaid = sumMoney(paidAmounts);
    const outstanding = sumMoney(outstandingAmounts);
    const overdueAmount = sumMoney(overdueAmounts);
    const paidRatioPercent = this.paidRatioPercent(totalPaid, totalObligated);
    const maxOverdueDays = this.maxOverdueDays(overdueDueDates, businessDate);
    const lastPaymentDate = this.lastPaymentDate(payments);
    const tier = determineReceivableTier({
      billsTotal,
      overdueItemCount,
      maxOverdueDays,
      paidRatioPercent,
      paymentCount: payments.length,
    });

    return {
      rank: tier.rank,
      outstanding,
      overdueAmount,
      item: {
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          isActive: customer.isActive,
        },
        tier: tier.tier,
        tierReason: tier.tierReason,
        maxOverdueDays,
        totalObligated: moneyToApiString(totalObligated),
        totalPaid: moneyToApiString(totalPaid),
        outstanding: moneyToApiString(outstanding),
        overdueAmount: moneyToApiString(overdueAmount),
        paidRatioPercent: String(paidRatioPercent),
        billsTotal,
        billsPaid,
        openDebtCount,
        activePlanCount,
        overdueItemCount,
        nextDueDate: this.earliestDate(nextDueDates),
        lastPaymentDate,
        daysSinceLastPayment: lastPaymentDate
          ? this.daysBetween(lastPaymentDate, businessDate)
          : null,
        paymentCount: payments.length,
      },
    };
  }

  private static matchesBaseFilters(
    computation: ReceivableComputation,
    query: ReceivablesQueryInput,
    matchedCustomerIds: Set<string> | null
  ): boolean {
    if (query.onlyWithBalance && !computation.outstanding.greaterThan(ZERO_MONEY)) {
      return false;
    }

    if (matchedCustomerIds && !matchedCustomerIds.has(computation.item.customer.id)) return false;

    return true;
  }

  private static countTiers(computations: ReceivableComputation[]): ReceivableTierCounts {
    const counts: ReceivableTierCounts = {
      NO_ACTIVITY: 0,
      CURRENT: 0,
      WATCH: 0,
      LATE: 0,
      SEVERE: 0,
      CRITICAL: 0,
    };

    for (const computation of computations) {
      counts[computation.item.tier] += 1;
    }

    return counts;
  }

  private static sortComputations(
    computations: ReceivableComputation[],
    query: ReceivablesQueryInput
  ): ReceivableComputation[] {
    const direction = query.sortOrder === 'asc' ? -1 : 1;

    return [...computations].sort((left, right) => {
      const primary = this.compareBySortKey(left, right, query.sortBy) * direction;
      if (primary !== 0) return primary;
      return left.item.customer.name.localeCompare(right.item.customer.name);
    });
  }

  /** Always returns "worst/highest first" ordering; the caller applies direction. */
  private static compareBySortKey(
    left: ReceivableComputation,
    right: ReceivableComputation,
    sortBy: ReceivablesQueryInput['sortBy']
  ): number {
    switch (sortBy) {
      case 'outstanding':
        return right.outstanding.comparedTo(left.outstanding);
      case 'overdue':
        return right.overdueAmount.comparedTo(left.overdueAmount);
      case 'name':
        return left.item.customer.name.localeCompare(right.item.customer.name) * -1;
      case 'lastPayment':
        return this.compareNullableDates(
          left.item.lastPaymentDate,
          right.item.lastPaymentDate
        );
      case 'standing':
      default: {
        if (left.rank !== right.rank) return right.rank - left.rank;
        return right.outstanding.comparedTo(left.outstanding);
      }
    }
  }

  /** Most recent first; customers who never paid sort last. */
  private static compareNullableDates(left: string | null, right: string | null): number {
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return compareBusinessDates(right, left);
  }

  private static buildSummary(computations: ReceivableComputation[]): ReceivablesSummaryView {
    const atRiskTiers: ReceivableTier[] = ['SEVERE', 'CRITICAL'];

    return {
      customerCount: computations.length,
      customersWithBalance: computations.filter((computation) =>
        computation.outstanding.greaterThan(ZERO_MONEY)
      ).length,
      customersOverdue: computations.filter(
        (computation) => computation.item.overdueItemCount > 0
      ).length,
      atRiskCount: computations.filter((computation) => atRiskTiers.includes(computation.item.tier))
        .length,
      totalOutstanding: moneyToApiString(
        sumMoney(computations.map((computation) => computation.outstanding))
      ),
      totalOverdue: moneyToApiString(
        sumMoney(computations.map((computation) => computation.overdueAmount))
      ),
    };
  }

  private static paidRatioPercent(totalPaid: Decimal, totalObligated: Decimal): number {
    if (!totalObligated.greaterThan(ZERO_MONEY)) return 0;
    const percent = totalPaid.div(totalObligated).mul(100).floor().toNumber();
    return Math.min(Math.max(percent, 0), 100);
  }

  private static maxOverdueDays(overdueDueDates: string[], businessDate: string): number {
    const oldest = this.earliestDate(overdueDueDates);
    if (!oldest) return 0;
    return Math.max(this.daysBetween(oldest, businessDate), 0);
  }

  private static earliestDate(dates: string[]): string | null {
    return dates.length === 0 ? null : [...dates].sort(compareBusinessDates)[0];
  }

  private static lastPaymentDate(payments: ReceivablePaymentRecord[]): string | null {
    if (payments.length === 0) return null;
    return payments
      .map((payment) => prismaDateToBusinessDate(payment.paymentDate))
      .sort(compareBusinessDates)
      .at(-1) as string;
  }

  /** Whole days from `from` to `to`; both are UTC-midnight business dates. */
  private static daysBetween(from: string, to: string): number {
    const fromTime = businessDateToPrisma(from).getTime();
    const toTime = businessDateToPrisma(to).getTime();
    return Math.round((toTime - fromTime) / MILLISECONDS_PER_DAY);
  }
}

function groupBy<T>(items: T[], keySelector: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keySelector(item);
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
}
