import { Decimal } from '@prisma/client/runtime/library';
import {
  compareBusinessDates, moneyToApiString, prismaDateToBusinessDate,
  subtractMoney, sumMoney, ZERO_MONEY,
} from '../../financial';
import { differenceInDays } from '../../dashboard/shared/dashboard-range';

/**
 * Receivables aging: how long money has been owed, measured from the day the
 * debt was raised.
 *
 * Age is deliberately measured from the debt's creation business date, not its
 * due date — the question this report answers is "how long has this been
 * outstanding", which is what tells an owner whether a balance is drifting. Due
 * date drives the separate overdue classification in the debt snapshot report.
 *
 * Scope: standard debts only. Installment plans have their own schedule and
 * are reported by the Customer Debts snapshot; folding them in here would need
 * a per-installment ageing model that this report does not claim to have.
 */
export const AGING_BUCKETS = [
  { key: 'DAYS_0_7', label: '0–7 days / ٠–٧ أيام', maxDays: 7 },
  { key: 'DAYS_8_14', label: '8–14 days / ٨–١٤ يوم', maxDays: 14 },
  { key: 'DAYS_15_30', label: '15–30 days / ١٥–٣٠ يوم', maxDays: 30 },
  { key: 'DAYS_31_60', label: '31–60 days / ٣١–٦٠ يوم', maxDays: 60 },
  { key: 'DAYS_61_90', label: '61–90 days / ٦١–٩٠ يوم', maxDays: 90 },
  { key: 'DAYS_90_PLUS', label: '90+ days / أكثر من ٩٠ يوم', maxDays: Number.POSITIVE_INFINITY },
] as const;

export type AgingBucketKey = (typeof AGING_BUCKETS)[number]['key'];

/** Unpaid, part-paid, or fully paid — plus whether it is past its due date. */
export type ReceivableStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';

export function agingBucket(daysUnpaid: number): AgingBucketKey {
  const days = Math.max(0, daysUnpaid);
  return (AGING_BUCKETS.find((bucket) => days <= bucket.maxDays) ?? AGING_BUCKETS[AGING_BUCKETS.length - 1]).key;
}

export interface AgingDebtRecord {
  id: string;
  description: string;
  originalAmount: Decimal;
  dueDate: Date;
  createdAt: Date;
  cancelledAt: Date | null;
  customer: { id: string; name: string; phone: string };
  salesOrder: { id: string; orderNumber: string } | null;
  paymentAllocations: Array<{ amount: Decimal; payment: { paymentDate: Date; voidedAt: Date | null } }>;
}

export interface AgingRow {
  debtId: string;
  customer: { id: string; name: string; phone: string };
  description: string;
  reference: string | null;
  salesOrderId: string | null;
  createdOn: string;
  dueDate: string;
  originalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  daysUnpaid: number;
  bucket: AgingBucketKey;
  lastPaymentDate: string | null;
  status: ReceivableStatus;
}

/**
 * Builds one row per still-open debt as of the cutoff.
 *
 * Point-in-time rules match the existing debt snapshot exactly: a payment
 * voided *after* the cutoff still counts *at* the cutoff, and a debt cancelled
 * after the cutoff was still owed at the cutoff.
 */
export function buildAgingRows(debts: AgingDebtRecord[], cutoff: string, nextDayAfterCutoff: Date): AgingRow[] {
  const rows: AgingRow[] = [];

  for (const debt of debts) {
    if (debt.cancelledAt && debt.cancelledAt < nextDayAfterCutoff) continue;

    const validAllocations = debt.paymentAllocations.filter((allocation) =>
      compareBusinessDates(prismaDateToBusinessDate(allocation.payment.paymentDate), cutoff) <= 0
      && (!allocation.payment.voidedAt || allocation.payment.voidedAt >= nextDayAfterCutoff));

    const paid = sumMoney(validAllocations.map((allocation) => allocation.amount));
    const remaining = nonNegative(subtractMoney(debt.originalAmount, paid));
    if (!remaining.greaterThan(ZERO_MONEY)) continue;

    const createdOn = prismaDateToBusinessDate(debt.createdAt);
    const dueDate = prismaDateToBusinessDate(debt.dueDate);
    // A debt raised after the cutoff cannot have aged yet; clamp at zero rather
    // than reporting a negative age.
    const daysUnpaid = Math.max(0, differenceInDays(createdOn, cutoff));
    const lastPaymentDate = validAllocations.length
      ? validAllocations
        .map((allocation) => prismaDateToBusinessDate(allocation.payment.paymentDate))
        .reduce((latest, date) => (compareBusinessDates(date, latest) > 0 ? date : latest))
      : null;

    rows.push({
      debtId: debt.id,
      customer: debt.customer,
      description: debt.description,
      reference: debt.salesOrder?.orderNumber ?? null,
      salesOrderId: debt.salesOrder?.id ?? null,
      createdOn,
      dueDate,
      originalAmount: moneyToApiString(debt.originalAmount),
      paidAmount: moneyToApiString(paid),
      remainingAmount: moneyToApiString(remaining),
      daysUnpaid,
      bucket: agingBucket(daysUnpaid),
      lastPaymentDate,
      status: resolveStatus(paid, dueDate, cutoff),
    });
  }

  return rows.sort((left, right) => right.daysUnpaid - left.daysUnpaid
    || left.customer.name.localeCompare(right.customer.name)
    || left.debtId.localeCompare(right.debtId));
}

export function summariseAging(rows: AgingRow[]) {
  const owed = (predicate: (row: AgingRow) => boolean) =>
    moneyToApiString(sumMoney(rows.filter(predicate).map((row) => new Decimal(row.remainingAmount))));
  const oldest = rows.reduce<AgingRow | null>(
    (worst, row) => (!worst || row.daysUnpaid > worst.daysUnpaid ? row : worst), null);
  const byCustomer = new Map<string, { name: string; amount: Decimal }>();
  for (const row of rows) {
    const current = byCustomer.get(row.customer.id) ?? { name: row.customer.name, amount: ZERO_MONEY };
    byCustomer.set(row.customer.id, { name: current.name, amount: sumMoney([current.amount, new Decimal(row.remainingAmount)]) });
  }
  const largest = [...byCustomer.entries()].reduce<{ id: string; name: string; amount: Decimal } | null>(
    (worst, [id, entry]) => (!worst || entry.amount.greaterThan(worst.amount) ? { id, ...entry } : worst), null);

  return {
    count: rows.length,
    totalReceivables: owed(() => true),
    totalOverdue: owed((row) => row.status === 'OVERDUE'),
    customersOwing: byCustomer.size,
    over30: owed((row) => row.daysUnpaid > 30),
    over60: owed((row) => row.daysUnpaid > 60),
    over90: owed((row) => row.daysUnpaid > 90),
    oldestDebt: oldest ? { debtId: oldest.debtId, customerName: oldest.customer.name, daysUnpaid: oldest.daysUnpaid, remainingAmount: oldest.remainingAmount } : null,
    largestCustomer: largest ? { customerId: largest.id, customerName: largest.name, remainingAmount: moneyToApiString(largest.amount) } : null,
    buckets: AGING_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      count: rows.filter((row) => row.bucket === bucket.key).length,
      amount: owed((row) => row.bucket === bucket.key),
    })),
  };
}

function resolveStatus(paid: Decimal, dueDate: string, cutoff: string): ReceivableStatus {
  if (compareBusinessDates(dueDate, cutoff) < 0) return 'OVERDUE';
  return paid.greaterThan(ZERO_MONEY) ? 'PARTIALLY_PAID' : 'UNPAID';
}

function nonNegative(value: Decimal): Decimal {
  return value.lessThan(ZERO_MONEY) ? ZERO_MONEY : value;
}
