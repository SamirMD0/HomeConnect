import { Decimal } from '@prisma/client/runtime/library';
import { Currency } from '@prisma/client';
import { moneyToApiString, parseMoney, sumMoney, ZERO_MONEY } from '../../financial/domain/money';
import { parseBusinessDate } from '../../financial/domain/business-date';
import { baseTierForOverdueDays } from '../../financial/receivables/receivables.tier';
import { differenceInDays } from '../../dashboard/shared/dashboard-range';
import { DASHBOARD_ALERT_THRESHOLDS } from '../../dashboard/dashboard.config';
import { ValidationError } from '../../../lib/errors';

export const PAYABLE_BUCKETS = [
  { key: 'CURRENT', label: 'Current / Not Due / غير مستحق' },
  { key: 'DAYS_1_30', label: '1–30 days overdue / متأخر ١–٣٠ يوم' },
  { key: 'DAYS_31_60', label: '31–60 days overdue / متأخر ٣١–٦٠ يوم' },
  { key: 'DAYS_61_90', label: '61–90 days overdue / متأخر ٦١–٩٠ يوم' },
  { key: 'DAYS_90_PLUS', label: '90+ days overdue / متأخر أكثر من ٩٠ يوم' },
  { key: 'NO_DUE_DATE', label: 'Unscheduled / No Due Date / بدون تاريخ استحقاق' },
] as const;

export function payableBucket(daysOverdue: number) {
  if (daysOverdue <= 0) return 'CURRENT';
  // Reuse the existing receivable due-date tier boundaries, without its
  // customer payment-behaviour adjustments (this is payable age, not risk).
  const keys = { WATCH: 'DAYS_1_30', LATE: 'DAYS_31_60', SEVERE: 'DAYS_61_90', CRITICAL: 'DAYS_90_PLUS' } as const;
  return keys[baseTierForOverdueDays(daysOverdue) as keyof typeof keys];
}

export interface PayableSource {
  id: string;
  supplier: { id: string; name: string; phone: string };
  direction: string;
  type: string;
  baseAmount: Decimal;
  amount: Decimal;
  currency: string;
  transactionDate: string;
  createdAt: string;
  dueDate: string | null;
  description: string;
  receiptNumber: string | null;
}

function fifoOrder(a: PayableSource, b: PayableSource) {
  return (a.dueDate === null && b.dueDate === null ? 0 : a.dueDate === null ? 1 : b.dueDate === null ? -1 : a.dueDate.localeCompare(b.dueDate)) ||
    a.transactionDate.localeCompare(b.transactionDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export function buildSupplierPayables(records: PayableSource[], businessDate: string,
  dueSoonDays: number = DASHBOARD_ALERT_THRESHOLDS.supplierPayablesDueSoonDays) {
  parseBusinessDate(businessDate);
  if (!Number.isInteger(dueSoonDays) || dueSoonDays < 0 || dueSoonDays > 365) throw new ValidationError('Invalid payable alert window');
  const groups = new Map<string, PayableSource[]>();
  for (const record of records) {
    const group = groups.get(record.supplier.id) ?? [];
    group.push(record);
    groups.set(record.supplier.id, group);
  }
  const rows: Array<{
    id: string; supplier: PayableSource['supplier']; description: string; receiptNumber: string | null;
    transactionDate: string; dueDate: string | null; currency: string; transactionAmount: string;
    originalAmount: string; fifoSettledAmount: string; remainingAmount: string; daysOverdue: number;
    status: 'OVERDUE' | 'DUE_SOON' | 'FUTURE' | 'UNSCHEDULED'; bucket: string;
  }> = [];
  const suppliers: Array<{ supplier: PayableSource['supplier']; totalPayables: string; unappliedCredit: string;
    ledgerBalance: string; independentlyComputedLedgerBalance: string; difference: string }> = [];
  for (const [, sources] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const increases = sources.filter((r) => r.direction === 'INCREASE_OWED').sort(fifoOrder);
    const decreaseTotal = sumMoney(sources.filter((r) => r.direction === 'DECREASE_OWED').map((r) => r.baseAmount));
    let settlement = decreaseTotal;
    let unpaid = ZERO_MONEY;
    for (const debt of increases) {
      const original = parseMoney(debt.baseAmount);
      const settled = Decimal.min(original, settlement);
      settlement = settlement.minus(settled);
      const remaining = original.minus(settled);
      unpaid = unpaid.plus(remaining);
      if (remaining.equals(0)) continue;
      const distance = debt.dueDate === null ? null : differenceInDays(businessDate, debt.dueDate);
      const daysOverdue = distance === null ? 0 : Math.max(0, -distance);
      const status = distance === null ? 'UNSCHEDULED' : distance < 0 ? 'OVERDUE' : distance <= dueSoonDays ? 'DUE_SOON' : 'FUTURE';
      rows.push({
        id: debt.id, supplier: debt.supplier, description: debt.description, receiptNumber: debt.receiptNumber,
        transactionDate: debt.transactionDate, dueDate: debt.dueDate, currency: debt.currency,
        transactionAmount: moneyToApiString(debt.amount, debt.currency === 'LBP' ? Currency.LBP : Currency.USD),
        originalAmount: moneyToApiString(original), fifoSettledAmount: moneyToApiString(settled), remainingAmount: moneyToApiString(remaining),
        daysOverdue, status, bucket: debt.dueDate === null ? 'NO_DUE_DATE' : payableBucket(daysOverdue),
      });
    }
    const ledgerBalance = unpaid.minus(settlement);
    const independent = sumMoney(increases.map((r) => r.baseAmount)).minus(decreaseTotal);
    suppliers.push({ supplier: sources[0].supplier, totalPayables: moneyToApiString(unpaid), unappliedCredit: moneyToApiString(settlement),
      ledgerBalance: moneyToApiString(ledgerBalance), independentlyComputedLedgerBalance: moneyToApiString(independent),
      difference: moneyToApiString(ledgerBalance.minus(independent)) });
  }
  rows.sort((a, b) => {
    const dateOrder = a.dueDate === null && b.dueDate === null ? 0 : a.dueDate === null ? 1 : b.dueDate === null ? -1 : a.dueDate.localeCompare(b.dueDate);
    return dateOrder || a.transactionDate.localeCompare(b.transactionDate) || a.id.localeCompare(b.id);
  });
  const total = (predicate: (r: typeof rows[number]) => boolean) => moneyToApiString(sumMoney(rows.filter(predicate).map((r) => new Decimal(r.remainingAmount))));
  const oldest = rows.find((r) => r.status === 'OVERDUE') ?? null;
  return { rows, suppliers, summary: {
    asOf: businessDate, dueSoonDays, calculationBasis: 'REPORT_ONLY_FIFO_STORED_BASE_USD', count: rows.length,
    totalPayables: total(() => true), totalOverdue: total((r) => r.status === 'OVERDUE'),
    overdueCount: rows.filter((r) => r.status === 'OVERDUE').length,
    dueSoonCount: rows.filter((r) => r.status === 'DUE_SOON').length, dueSoonAmount: total((r) => r.status === 'DUE_SOON'),
    futureAmount: total((r) => r.status === 'FUTURE'), noDueDate: total((r) => r.status === 'UNSCHEDULED'),
    unappliedCredit: moneyToApiString(sumMoney(suppliers.map((s) => new Decimal(s.unappliedCredit)))),
    ledgerBalance: moneyToApiString(sumMoney(suppliers.map((s) => new Decimal(s.ledgerBalance)))),
    oldestOverdue: oldest ? { id: oldest.id, supplierName: oldest.supplier.name, supplierId: oldest.supplier.id,
      dueDate: oldest.dueDate, daysOverdue: oldest.daysOverdue, remainingAmount: oldest.remainingAmount } : null,
    buckets: PAYABLE_BUCKETS.map((b) => ({ ...b, count: rows.filter((r) => r.bucket === b.key).length, amount: total((r) => r.bucket === b.key) })),
  } };
}
