import {
  SupplierTransactionDirection,
  SupplierTransactionStatus,
  SupplierTransactionType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  moneyToApiString,
  prismaDateToBusinessDate,
  subtractMoney,
  sumMoney,
  todayInBusinessTimezone,
  ZERO_MONEY,
} from '../../financial';
import { DASHBOARD_TOP_RECORD_LIMIT } from '../dashboard.config';
import type { ResolvedDashboardRange } from '../dashboard.types';
import { addDays } from '../shared/dashboard-range';
import {
  SupplierAnalyticsRepository,
  type SupplierAnalyticsTransaction,
} from './supplier-analytics.repository';
import type { SupplierAnalyticsData } from './supplier-analytics.types';

export class SupplierAnalyticsService {
  static async get(
    range: ResolvedDashboardRange,
    includeArchived: boolean,
    businessDate = todayInBusinessTimezone()
  ): Promise<SupplierAnalyticsData> {
    return this.aggregate(await SupplierAnalyticsRepository.load(includeArchived), range, businessDate, includeArchived);
  }

  static aggregate(
    records: SupplierAnalyticsTransaction[],
    range: ResolvedDashboardRange,
    businessDate: string,
    includeArchived: boolean
  ): SupplierAnalyticsData {
    const active = records.filter(
      (record) =>
        record.status === SupplierTransactionStatus.ACTIVE &&
        (includeArchived || record.supplier.isActive)
    );
    const rangePayments = active.filter(
      (record) =>
        record.type === SupplierTransactionType.SUPPLIER_PAYMENT &&
        inRange(prismaDateToBusinessDate(record.transactionDate), range.from, range.to)
    );
    const balances = new Map<
      string,
      { supplier: SupplierAnalyticsTransaction['supplier']; increases: Decimal[]; decreases: Decimal[] }
    >();
    for (const record of active) {
      const value = balances.get(record.supplierId) ?? {
        supplier: record.supplier,
        increases: [],
        decreases: [],
      };
      value[record.direction === SupplierTransactionDirection.INCREASE_OWED ? 'increases' : 'decreases'].push(record.amount);
      balances.set(record.supplierId, value);
    }
    const balanceRows = [...balances.entries()].map(([supplierId, value]) => ({
      supplierId,
      supplierName: value.supplier.name,
      companyName: value.supplier.companyName,
      amount: subtractMoney(sumMoney(value.increases), sumMoney(value.decreases)),
    }));
    const positiveRows = balanceRows.filter((row) => row.amount.greaterThan(ZERO_MONEY));

    return {
      totals: {
        owed: moneyToApiString(sumMoney(positiveRows.map((row) => row.amount))),
        paid: moneyToApiString(sumMoney(rangePayments.map((record) => record.amount))),
        paidToday: moneyToApiString(
          sumMoney(
            active
              .filter(
                (record) =>
                  record.type === SupplierTransactionType.SUPPLIER_PAYMENT &&
                  prismaDateToBusinessDate(record.transactionDate) === businessDate
              )
              .map((record) => record.amount)
          )
        ),
        suppliersWithBalance: positiveRows.length,
      },
      trend: bucketKeys(range).map((bucket) => ({
        bucket,
        paid: moneyToApiString(
          sumMoney(
            rangePayments
              .filter(
                (record) =>
                  bucketFor(prismaDateToBusinessDate(record.transactionDate), range.granularity) === bucket
              )
              .map((record) => record.amount)
          )
        ),
      })),
      topBalances: positiveRows
        .sort(
          (left, right) =>
            right.amount.comparedTo(left.amount) ||
            left.supplierName.localeCompare(right.supplierName) ||
            left.supplierId.localeCompare(right.supplierId)
        )
        .slice(0, DASHBOARD_TOP_RECORD_LIMIT)
        .map(({ amount, ...row }) => ({ ...row, balance: moneyToApiString(amount) })),
    };
  }
}

function bucketKeys(range: ResolvedDashboardRange): string[] {
  const values: string[] = [];
  for (let cursor = range.from; cursor <= range.to; cursor = addDays(cursor, 1)) {
    const bucket = bucketFor(cursor, range.granularity);
    if (values.at(-1) !== bucket) values.push(bucket);
  }
  return values;
}

function bucketFor(date: string, granularity: ResolvedDashboardRange['granularity']): string {
  if (granularity === 'day') return date;
  if (granularity === 'month') return date.slice(0, 7);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -(weekday === 0 ? 6 : weekday - 1));
}

function inRange(value: string, from: string, to: string): boolean {
  return value >= from && value <= to;
}

