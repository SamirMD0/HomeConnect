import { SupplierTransactionDirection, SupplierTransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  addMoney,
  moneyToApiString,
  parseBusinessDate,
  prismaDateToBusinessDate,
  subtractMoney,
  sumMoney,
  ZERO_MONEY,
} from '../../financial';
import { MonthlyDebtsService } from '../../reports/monthly-debts/monthly-debts.service';
import { addDays, differenceInDays, resolveMonthRange } from '../shared/dashboard-range';
import { MonthEndRepository, type MonthEndOperationalRecords } from './month-end.repository';
import type { MonthEndData, MonthEndMovement, RangeMonthEndData } from './month-end.types';

const DISCLOSURE = {
  en: 'Computed from current records. Retroactive corrections restate closed months.',
  ar: 'محسوبة من السجلات الحالية. التصحيحات بأثر رجعي تعيد بيان الأشهر المغلقة.',
} as const;

export class MonthEndService {
  static get(month: string): Promise<MonthEndData>;
  static get(range: { from: string; to: string }): Promise<RangeMonthEndData>;
  static get(input: string | { from: string; to: string }): Promise<MonthEndData | RangeMonthEndData> {
    return typeof input === 'string' ? this.getMonth(input) : this.getRange(input.from, input.to);
  }

  private static async getMonth(month: string): Promise<MonthEndData> {
    const { from, to } = resolveMonthRange(month);
    const priorMonth = addDays(from, -1).slice(0, 7);
    const query = (value: string, includeZero: boolean) => ({
      month: value,
      mode: 'SNAPSHOT' as const,
      includeZero,
      includeCancelled: false,
      overdueOnly: false,
      page: 1,
      limit: 10_000,
      sortBy: 'OUTSTANDING' as const,
      sortOrder: 'DESC' as const,
    });
    const [openingReport, closingReport, activity, operational] = await Promise.all([
      MonthlyDebtsService.getMonthlyDebtReport(query(priorMonth, false)),
      MonthlyDebtsService.getMonthlyDebtReport(query(month, true)),
      MonthlyDebtsService.getMonthlyFinancialActivity({ month, page: 1, limit: 10_000 }),
      MonthEndRepository.loadOperationalRecords(),
    ]);

    return this.aggregateOperational(
      month,
      operational,
      this.customerMovement(openingReport, closingReport, activity),
      from,
      to
    );
  }

  private static async getRange(fromInput: string, toInput: string): Promise<RangeMonthEndData> {
    const from = parseRangeDate(fromInput);
    const to = parseRangeDate(toInput);
    if (from > to) throw new Error('Month-end range from must not be after to');
    const openingCutoff = addDays(from, -1);
    const snapshotQuery = (month: string, includeZero: boolean) => ({
      month,
      mode: 'SNAPSHOT' as const,
      includeZero,
      includeCancelled: false,
      overdueOnly: false,
      page: 1,
      limit: 10_000,
      sortBy: 'OUTSTANDING' as const,
      sortOrder: 'DESC' as const,
    });
    const [openingReport, closingReport, activity, operational] = await Promise.all([
      MonthlyDebtsService.getDebtReportForRange(
        snapshotQuery(openingCutoff.slice(0, 7), false),
        openingCutoff,
        openingCutoff
      ),
      MonthlyDebtsService.getDebtReportForRange(snapshotQuery(to.slice(0, 7), true), from, to),
      MonthlyDebtsService.getFinancialActivityForRange(
        { month: from.slice(0, 7), page: 1, limit: 10_000 },
        from,
        to
      ),
      MonthEndRepository.loadOperationalRecords(),
    ]);
    const result = this.aggregateOperational(
      from.slice(0, 7),
      operational,
      this.customerMovement(openingReport, closingReport, activity),
      from,
      to
    );

    return {
      meta: { from, to },
      disclosure: result.disclosure,
      customers: result.customers,
      suppliers: result.suppliers,
      service: result.service,
    };
  }

  private static customerMovement(
    openingReport: Awaited<ReturnType<typeof MonthlyDebtsService.getMonthlyDebtReport>>,
    closingReport: Awaited<ReturnType<typeof MonthlyDebtsService.getMonthlyDebtReport>>,
    activity: Awaited<ReturnType<typeof MonthlyDebtsService.getMonthlyFinancialActivity>>
  ): MonthEndData['customers'] {
    const customerMovement = reconcileMovement({
      opening: openingReport.summary.totalOutstanding,
      newAmount: sumMoney([
        activity.summary.newSingleDebtAmount,
        activity.summary.newInstallmentPlanAmount,
      ]),
      collected: activity.summary.paymentsReceived,
      closing: closingReport.summary.totalOutstanding,
    });
    const overdue = closingReport.rows.filter((row) =>
      new Decimal(row.overdueAmountAtCutoff).greaterThan(ZERO_MONEY)
    );
    const withDebt = closingReport.rows.filter(
      (row) =>
        new Decimal(row.totalOutstanding).greaterThan(ZERO_MONEY) &&
        new Decimal(row.overdueAmountAtCutoff).equals(ZERO_MONEY)
    );
    const fullyPaid = closingReport.rows.filter((row) =>
      new Decimal(row.totalOutstanding).equals(ZERO_MONEY)
    );
    return {
      ...customerMovement,
      withDebt: withDebt.length,
      fullyPaid: fullyPaid.length,
      overdue: overdue.length,
    };
  }

  static aggregateOperational(
    month: string,
    records: MonthEndOperationalRecords,
    customers: MonthEndData['customers'],
    from = resolveMonthRange(month).from,
    to = resolveMonthRange(month).to
  ): MonthEndData {
    const supplierAtOpening = supplierBalancesAt(records, addDays(from, -1));
    const supplierAtClosing = supplierBalancesAt(records, to);
    const monthTransactions = records.supplierTransactions.filter((record) =>
      inRange(prismaDateToBusinessDate(record.transactionDate), from, to)
    );
    const supplierMovement = reconcileMovement({
      opening: sumMoney([...supplierAtOpening.values()].filter(positive)),
      newAmount: sumMoney(
        monthTransactions
          .filter((record) => record.type === SupplierTransactionType.SUPPLIER_DEBT)
          .map((record) => record.amount)
      ),
      collected: sumMoney(
        monthTransactions
          .filter((record) => record.type === SupplierTransactionType.SUPPLIER_PAYMENT)
          .map((record) => record.amount)
      ),
      closing: sumMoney([...supplierAtClosing.values()].filter(positive)),
    });

    const opened = records.serviceJobs.filter((job) =>
      inRange(prismaDateToBusinessDate(job.serviceCreatedDate), from, to)
    );
    const completed = records.serviceJobs.filter(
      (job) => job.completedAt && inRange(job.completedAt.toISOString().slice(0, 10), from, to)
    );
    const cancelled = records.serviceJobs.filter(
      (job) => job.cancelledAt && inRange(job.cancelledAt.toISOString().slice(0, 10), from, to)
    );
    const pendingAtClose = records.serviceJobs.filter((job) => {
      const created = prismaDateToBusinessDate(job.serviceCreatedDate);
      return created <= to && (!job.completedAt || job.completedAt.toISOString().slice(0, 10) > to) && (!job.cancelledAt || job.cancelledAt.toISOString().slice(0, 10) > to);
    });
    const averageDaysOpen = pendingAtClose.length
      ? Math.round(
          pendingAtClose.reduce(
            (sum, job) => sum + Math.max(0, differenceInDays(prismaDateToBusinessDate(job.serviceCreatedDate), to)),
            0
          ) / pendingAtClose.length
        )
      : 0;

    return {
      month,
      disclosure: DISCLOSURE,
      customers,
      suppliers: {
        ...supplierMovement,
        withBalance: [...supplierAtClosing.values()].filter(positive).length,
      },
      service: {
        opened: opened.length,
        completed: completed.length,
        pending: pendingAtClose.length,
        cancelled: cancelled.length,
        netOpen: opened.length - completed.length - cancelled.length,
        averageDaysOpen,
      },
    };
  }
}

function parseRangeDate(value: string): string {
  return parseBusinessDate(value);
}

export function reconcileMovement(input: {
  opening: string | Decimal;
  newAmount: string | Decimal;
  collected: string | Decimal;
  closing: string | Decimal;
}): MonthEndMovement {
  const expectedBeforeAdjustments = subtractMoney(addMoney(input.opening, input.newAmount), input.collected);
  const adjustments = subtractMoney(input.closing, expectedBeforeAdjustments);
  const reconciledClosing = addMoney(expectedBeforeAdjustments, adjustments);
  const closing = new Decimal(input.closing.toString());
  return {
    opening: moneyToApiString(input.opening),
    newAmount: moneyToApiString(input.newAmount),
    collected: moneyToApiString(input.collected),
    adjustments: moneyToApiString(adjustments),
    closing: moneyToApiString(closing),
    reconciled: reconciledClosing.equals(closing),
  };
}

function supplierBalancesAt(records: MonthEndOperationalRecords, cutoff: string): Map<string, Decimal> {
  const values = new Map<string, Decimal>();
  for (const record of records.supplierTransactions) {
    if (!record.supplier.isActive || prismaDateToBusinessDate(record.transactionDate) > cutoff) continue;
    const current = values.get(record.supplierId) ?? ZERO_MONEY;
    values.set(
      record.supplierId,
      record.direction === SupplierTransactionDirection.INCREASE_OWED
        ? addMoney(current, record.amount)
        : subtractMoney(current, record.amount)
    );
  }
  return values;
}

function positive(value: Decimal): boolean {
  return value.greaterThan(ZERO_MONEY);
}

function inRange(value: string, from: string, to: string): boolean {
  return value >= from && value <= to;
}
