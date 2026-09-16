import { Currency, DebtStatus, InstallmentPlanStatus, InstallmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundError } from '../../../lib/errors';
import { AGING_BUCKETS, agingBucket } from '../../reports/shared/receivables-aging';
import { differenceInDays } from '../../dashboard/shared/dashboard-range';
import {
  getBusinessTimezone,
  moneyToApiString,
  prismaDateToBusinessDate,
  sumMoney,
  timestampToBusinessDate,
  toBaseAmount,
  todayInBusinessTimezone,
  ZERO_MONEY,
} from '../index';
import {
  CustomerStatementRecordSet,
  CustomerStatementRepository,
  StatementPaymentRecord,
} from './customer-statement.repository';
import type { CustomerStatementQuery } from './customer-statement.validator';

type StatementEntryType = 'DEBT' | 'INSTALLMENT' | 'PAYMENT' | 'RETURN';
type StatementEntryStatus = 'POSTED' | 'VOIDED' | 'CANCELLED';

interface WorkingEntry {
  id: string;
  type: StatementEntryType;
  date: string;
  createdAt: string;
  sortNumber: number;
  description: string;
  reference: string | null;
  originalAmount: string;
  currency: Currency;
  exchangeRate: string;
  baseAmount: Decimal;
  effect: Decimal;
  status: StatementEntryStatus;
  dueDate: string | null;
  reason: string | null;
}

const TYPE_ORDER: Record<StatementEntryType, number> = { DEBT: 0, INSTALLMENT: 1, PAYMENT: 2, RETURN: 3 };

export class CustomerStatementService {
  static async get(customerId: string, query: CustomerStatementQuery) {
    const records = await CustomerStatementRepository.load(customerId);
    if (!records.customer) throw new NotFoundError('Customer not found');
    return buildCustomerStatement(records, query);
  }
}

export function buildCustomerStatement(records: CustomerStatementRecordSet, query: CustomerStatementQuery) {
  if (!records.customer) throw new NotFoundError('Customer not found');
  const timezone = getBusinessTimezone();
  const activeDebtIds = new Set(records.debts.filter((debt) => !isDebtCancelled(debt)).map((debt) => debt.id));
  const activeInstallmentIds = new Set(records.plans.flatMap((plan) => isPlanCancelled(plan)
    ? []
    : plan.installments.filter((item) => item.status !== InstallmentStatus.CANCELLED).map((item) => item.id)));
  const paymentEffects = new Map(records.payments.map((payment) => [
    payment.id,
    paymentEffect(payment, activeDebtIds, activeInstallmentIds),
  ]));

  const allEntries: WorkingEntry[] = [
    ...records.debts.map((debt): WorkingEntry => {
      const cancelled = isDebtCancelled(debt);
      const amount = debt.baseOriginalAmount ?? debt.originalAmount;
      return {
        id: debt.id, type: 'DEBT', date: timestampToBusinessDate(timezone, debt.createdAt), createdAt: debt.createdAt.toISOString(), sortNumber: 0,
        description: debt.description, reference: debt.salesOrder?.orderNumber ?? null,
        originalAmount: moneyToApiString(debt.originalAmount, debt.currency), currency: debt.currency,
        exchangeRate: debt.exchangeRate.toString(), baseAmount: amount,
        effect: cancelled ? ZERO_MONEY : amount, status: cancelled ? 'CANCELLED' : 'POSTED',
        dueDate: prismaDateToBusinessDate(debt.dueDate), reason: cancelled ? debt.cancelReason : null,
      };
    }),
    ...records.plans.flatMap((plan) => plan.installments.map((installment): WorkingEntry => {
      const cancelled = isPlanCancelled(plan) || installment.status === InstallmentStatus.CANCELLED;
      const amount = installment.baseAmountDue ?? installment.amountDue;
      return {
        id: installment.id, type: 'INSTALLMENT', date: timestampToBusinessDate(timezone, installment.createdAt), createdAt: installment.createdAt.toISOString(), sortNumber: installment.installmentNumber,
        description: `${plan.description} · Installment ${installment.installmentNumber}`,
        reference: plan.salesOrder?.orderNumber ?? null,
        originalAmount: moneyToApiString(installment.amountDue, plan.currency), currency: plan.currency,
        exchangeRate: plan.exchangeRate.toString(), baseAmount: amount,
        effect: cancelled ? ZERO_MONEY : amount, status: cancelled ? 'CANCELLED' : 'POSTED',
        dueDate: prismaDateToBusinessDate(installment.dueDate), reason: cancelled ? plan.cancelReason : null,
      };
    })),
    ...records.payments.map((payment): WorkingEntry => {
      const voided = Boolean(payment.voidedAt);
      const effect = voided ? ZERO_MONEY : paymentEffects.get(payment.id) ?? ZERO_MONEY;
      return {
        id: payment.id, type: 'PAYMENT', date: prismaDateToBusinessDate(payment.paymentDate), createdAt: payment.createdAt.toISOString(), sortNumber: 0,
        description: `Payment · ${payment.paymentMethod}`, reference: payment.reference,
        originalAmount: moneyToApiString(payment.totalAmount, payment.currency), currency: payment.currency,
        exchangeRate: payment.exchangeRate.toString(), baseAmount: payment.baseAmount ?? effect,
        effect: effect.negated(), status: voided ? 'VOIDED' : 'POSTED', dueDate: null,
        reason: voided ? payment.voidReason : null,
      };
    }),
    ...(records.returns ?? []).map((salesReturn): WorkingEntry => ({
      id: salesReturn.id,
      type: 'RETURN',
      date: prismaDateToBusinessDate(salesReturn.returnDate),
      createdAt: salesReturn.processedAt.toISOString(),
      sortNumber: 0,
      description: `Sales return · ${salesReturn.refundMethod}`,
      reference: salesReturn.returnNumber,
      originalAmount: moneyToApiString(salesReturn.totalIncVat, salesReturn.currency),
      currency: salesReturn.currency,
      exchangeRate: salesReturn.exchangeRate.toString(),
      baseAmount: salesReturn.baseTotalIncVat,
      effect: salesReturn.baseReceivableReliefAmount.negated(),
      status: 'POSTED',
      dueDate: null,
      reason: salesReturn.reason,
    })),
  ].sort(compareEntries);

  const opening = sumMoney(allEntries.filter((entry) => entry.date < query.from).map((entry) => entry.effect));
  const ranged = allEntries.filter((entry) => entry.date >= query.from && entry.date <= query.to);
  let running = opening;
  const entries = ranged.map((entry) => {
    running = sumMoney([running, entry.effect]);
    return {
      id: entry.id, type: entry.type, date: entry.date, description: entry.description,
      reference: entry.reference, originalAmount: entry.originalAmount, currency: entry.currency,
      exchangeRate: entry.exchangeRate, baseAmount: moneyToApiString(entry.baseAmount),
      balanceEffect: moneyToApiString(entry.effect), runningBalance: moneyToApiString(running),
      status: entry.status, dueDate: entry.dueDate, reason: entry.reason,
    };
  });

  const closing = running;
  const agingItems = buildAgingItems(records, query.to);
  return {
    businessDate: todayInBusinessTimezone(),
    currency: Currency.USD,
    customer: records.customer,
    range: { from: query.from, to: query.to },
    openingBalance: moneyToApiString(opening),
    entries,
    closingBalance: moneyToApiString(closing),
    aging: {
      asOf: query.to,
      total: moneyToApiString(sumMoney(agingItems.map((item) => item.remaining))),
      buckets: AGING_BUCKETS.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        amount: moneyToApiString(sumMoney(agingItems.filter((item) => item.bucket === bucket.key).map((item) => item.remaining))),
      })),
    },
  };
}

function buildAgingItems(records: CustomerStatementRecordSet, cutoff: string) {
  const timezone = getBusinessTimezone();
  const validPayments = records.payments.filter((payment) => !payment.voidedAt && prismaDateToBusinessDate(payment.paymentDate) <= cutoff);
  const paidByTarget = new Map<string, Decimal>();
  for (const payment of validPayments) {
    for (const allocation of payment.allocations) {
      if (allocation.voidedAt) continue;
      const targetId = allocation.debtId ?? allocation.installmentId;
      if (!targetId) continue;
      paidByTarget.set(targetId, sumMoney([paidByTarget.get(targetId) ?? ZERO_MONEY, allocationBaseAmount(payment, allocation.paymentAmount)]));
    }
  }
  for (const salesReturn of records.returns ?? []) {
    if (prismaDateToBusinessDate(salesReturn.returnDate) > cutoff) continue;
    for (const allocation of salesReturn.receivableAllocations) {
      const targetId = allocation.debtId ?? allocation.installmentId;
      if (!targetId) continue;
      paidByTarget.set(targetId, sumMoney([paidByTarget.get(targetId) ?? ZERO_MONEY, allocation.baseAmount]));
    }
  }
  const obligations = [
    ...records.debts.filter((debt) => !isDebtCancelled(debt)).map((debt) => ({ id: debt.id, date: timestampToBusinessDate(timezone, debt.createdAt), amount: debt.baseOriginalAmount ?? debt.originalAmount })),
    ...records.plans.filter((plan) => !isPlanCancelled(plan)).flatMap((plan) => plan.installments.filter((item) => item.status !== InstallmentStatus.CANCELLED).map((item) => ({ id: item.id, date: timestampToBusinessDate(timezone, item.createdAt), amount: item.baseAmountDue ?? item.amountDue }))),
  ];
  return obligations.filter((item) => item.date <= cutoff).map((item) => {
    const remaining = Decimal.max(ZERO_MONEY, item.amount.minus(paidByTarget.get(item.id) ?? ZERO_MONEY));
    return { remaining, bucket: agingBucket(differenceInDays(item.date, cutoff)) };
  }).filter((item) => item.remaining.greaterThan(ZERO_MONEY));
}

function paymentEffect(payment: StatementPaymentRecord, debtIds: Set<string>, installmentIds: Set<string>): Decimal {
  if (payment.voidedAt) return ZERO_MONEY;
  return sumMoney(payment.allocations.filter((allocation) =>
    !allocation.voidedAt && ((allocation.debtId && debtIds.has(allocation.debtId)) || (allocation.installmentId && installmentIds.has(allocation.installmentId))))
    .map((allocation) => allocationBaseAmount(payment, allocation.paymentAmount)));
}

function allocationBaseAmount(payment: StatementPaymentRecord, paymentAmount: Decimal): Decimal {
  return toBaseAmount(paymentAmount, payment.currency, payment.exchangeRate, Decimal.ROUND_HALF_UP);
}

function isDebtCancelled(debt: CustomerStatementRecordSet['debts'][number]) {
  return debt.status === DebtStatus.CANCELLED || Boolean(debt.cancelledAt);
}

function isPlanCancelled(plan: CustomerStatementRecordSet['plans'][number]) {
  return plan.status === InstallmentPlanStatus.CANCELLED || Boolean(plan.cancelledAt);
}

function compareEntries(left: WorkingEntry, right: WorkingEntry) {
  return left.date.localeCompare(right.date)
    || TYPE_ORDER[left.type] - TYPE_ORDER[right.type]
    || left.sortNumber - right.sortNumber
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id);
}
