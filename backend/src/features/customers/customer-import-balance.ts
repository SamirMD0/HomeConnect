import { Currency, DebtKind, DebtStatus, InstallmentPlanStatus, Prisma } from '@prisma/client';
import {
  calculateDebtBalance,
  calculateInstallmentBalance,
  isPaymentAllocationVoided,
} from '../financial/domain/balances';
import { prismaDateToBusinessDate } from '../financial/domain/business-date';
import {
  Decimal,
  minMoney,
  moneyToApiString,
  parseMoney,
  subtractMoney,
  sumMoney,
  ZERO_MONEY,
} from '../financial/domain/money';

export const IMPORT_PAYMENT_KEY_PREFIX = 'customer-import:';

export interface OpenObligation {
  kind: 'DEBT' | 'PLAN';
  id: string;
  currency: Currency;
  /** Earliest unpaid due date; a plan is ordered by its oldest open installment. */
  dueDate: string;
  remaining: Decimal;
}
export interface CustomerBalanceState {
  obligations: OpenObligation[];
  activitySinceLastImport: boolean;
}
export type BalanceChangeKind =
  | 'NEW'
  | 'NONE'
  | 'NO_INFO'
  | 'INCREASE'
  | 'DECREASE'
  | 'CURRENCY_MISMATCH';
export interface BalanceChange {
  kind: BalanceChangeKind;
  current: string;
  file: string | null;
  difference: string;
}
export interface PlannedBalancePayment {
  kind: 'DEBT' | 'PLAN';
  id: string;
  amount: Decimal;
}

function sortObligations(obligations: OpenObligation[]) {
  return [...obligations].sort(
    (left, right) => left.dueDate.localeCompare(right.dueDate) || left.id.localeCompare(right.id)
  );
}
/** Oldest due first; a file balance is never negative, so amount fits the total. */
export function planBalancePayments(
  obligations: OpenObligation[],
  amount: Decimal,
  currency: Currency
): PlannedBalancePayment[] {
  let left = amount;
  const planned: PlannedBalancePayment[] = [];
  for (const obligation of sortObligations(obligations)) {
    if (!left.greaterThan(ZERO_MONEY)) break;
    const paid = minMoney(left, obligation.remaining, currency);
    planned.push({ kind: obligation.kind, id: obligation.id, amount: paid });
    left = subtractMoney(left, paid, currency);
  }
  return planned;
}

/** A blank cell or an unmapped column is no information; only an explicit 0 is zero. */
export function classifyBalance(
  row: {
    hasBalance: boolean;
    openingBalance: string;
    currency: Currency;
    issues: string[];
  },
  state?: CustomerBalanceState
): BalanceChange {
  const obligations = state?.obligations ?? [];
  const sameCurrency = obligations.filter((item) => item.currency === row.currency);
  const current = sumMoney(
    sameCurrency.map((item) => item.remaining),
    row.currency
  );
  const view = (kind: BalanceChangeKind, file: Decimal | null, difference = ZERO_MONEY) => ({
    kind,
    current: moneyToApiString(current, row.currency),
    file: file && moneyToApiString(file, row.currency),
    difference: moneyToApiString(difference, row.currency),
  });
  if (row.issues.length || !row.hasBalance) return view('NO_INFO', null);
  const file = parseMoney(row.openingBalance, row.currency);
  if (sameCurrency.length !== obligations.length) return view('CURRENCY_MISMATCH', file);
  const difference = subtractMoney(file, current, row.currency);
  if (difference.isZero()) return view('NONE', file);
  if (difference.isNegative()) return view('DECREASE', file, difference);
  return view(current.isZero() ? 'NEW' : 'INCREASE', file, difference);
}

const allocationSelect = {
  amount: true,
  voidedAt: true,
  payment: { select: { voidedAt: true } },
} satisfies Prisma.PaymentAllocationSelect;

/** One batch for up to 2,000 rows. Totals use the same calculators and exclusions
 * as the customer financial summary: cancelled records and prepaid items never count. */
export async function loadCustomerBalances(
  customerIds: string[],
  tx: Prisma.TransactionClient
): Promise<Map<string, CustomerBalanceState>> {
  const states = new Map<string, CustomerBalanceState>();
  if (!customerIds.length) return states;
  const customerId = { in: customerIds };
  const [debts, plans, payments, accounts] = await Promise.all([
    tx.debt.findMany({
      where: { customerId, status: { not: DebtStatus.CANCELLED }, cancelledAt: null },
      select: {
        id: true,
        customerId: true,
        kind: true,
        currency: true,
        dueDate: true,
        originalAmount: true,
        createdAt: true,
        sourceCustomerImportId: true,
        sourceCustomerImport: { select: { committedAt: true } },
        paymentAllocations: { select: allocationSelect },
        returnAllocations: { select: { amount: true } },
      },
    }),
    tx.installmentPlan.findMany({
      where: { customerId, status: { not: InstallmentPlanStatus.CANCELLED }, cancelledAt: null },
      select: {
        id: true,
        customerId: true,
        currency: true,
        totalAmount: true,
        createdAt: true,
        installments: {
          select: {
            status: true,
            dueDate: true,
            amountDue: true,
            paymentAllocations: { select: allocationSelect },
            returnAllocations: { select: { amount: true } },
          },
        },
      },
    }),
    tx.payment.findMany({
      where: { customerId, voidedAt: null, salesOrderId: null },
      select: { customerId: true, createdAt: true, idempotencyKey: true },
    }),
    tx.customerImportAccount.findMany({
      where: { customerId },
      select: { customerId: true, sourceCustomerImport: { select: { committedAt: true } } },
    }),
  ]);

  const obligations = new Map<string, OpenObligation[]>();
  const lastImport = new Map<string, number>();
  const lastOther = new Map<string, number>();
  const later = (target: Map<string, number>, id: string, at: Date | null | undefined) => {
    if (at) target.set(id, Math.max(target.get(id) ?? 0, at.getTime()));
  };
  const add = (id: string, obligation: OpenObligation) =>
    obligations.set(id, [...(obligations.get(id) ?? []), obligation]);
  const settled = (allocation: Parameters<typeof isPaymentAllocationVoided>[0] & { amount: Decimal }) => ({
    amount: allocation.amount,
    isVoided: isPaymentAllocationVoided(allocation),
  });

  for (const debt of debts) {
    if (debt.sourceCustomerImportId) later(lastImport, debt.customerId, debt.sourceCustomerImport?.committedAt);
    else later(lastOther, debt.customerId, debt.createdAt);
    if (debt.kind === DebtKind.PREPAID_PURCHASE) continue;
    const { remainingBalance } = calculateDebtBalance({
      originalAmount: debt.originalAmount,
      allocations: debt.paymentAllocations.map(settled),
      credits: debt.returnAllocations.map((credit) => ({ amount: credit.amount })),
    });
    if (remainingBalance.greaterThan(ZERO_MONEY))
      add(debt.customerId, {
        kind: 'DEBT',
        id: debt.id,
        currency: debt.currency,
        dueDate: prismaDateToBusinessDate(debt.dueDate),
        remaining: remainingBalance,
      });
  }
  for (const plan of plans) {
    later(lastOther, plan.customerId, plan.createdAt);
    const balances = plan.installments.map((installment) => ({
      dueDate: prismaDateToBusinessDate(installment.dueDate),
      cancelled: installment.status === 'CANCELLED',
      ...calculateInstallmentBalance({
        amountDue: installment.amountDue,
        allocations: installment.paymentAllocations.map(settled),
        credits: installment.returnAllocations.map((credit) => ({ amount: credit.amount })),
      }),
    }));
    const remaining = subtractMoney(
      plan.totalAmount,
      sumMoney(balances.map((balance) => balance.totalSettled ?? balance.totalPaid))
    );
    if (remaining.greaterThan(ZERO_MONEY))
      add(plan.customerId, {
        kind: 'PLAN',
        id: plan.id,
        currency: plan.currency,
        dueDate:
          balances
            .filter((balance) => !balance.cancelled && !balance.isFullyPaid)
            .map((balance) => balance.dueDate)
            .sort()[0] ?? '9999-12-31',
        remaining,
      });
  }
  for (const payment of payments) {
    if (!payment.customerId) continue;
    if (payment.idempotencyKey?.startsWith(IMPORT_PAYMENT_KEY_PREFIX))
      later(lastImport, payment.customerId, payment.createdAt);
    else later(lastOther, payment.customerId, payment.createdAt);
  }
  for (const account of accounts)
    later(lastImport, account.customerId, account.sourceCustomerImport.committedAt);

  for (const id of customerIds) {
    const imported = lastImport.get(id);
    states.set(id, {
      obligations: sortObligations(obligations.get(id) ?? []),
      // A customer never imported has no earlier file to be older than.
      activitySinceLastImport: imported !== undefined && (lastOther.get(id) ?? 0) > imported,
    });
  }
  return states;
}
