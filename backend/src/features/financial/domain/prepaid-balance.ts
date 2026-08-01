import { DebtKind, PrepaidPurchaseStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { MoneyInput, parseMoney, subtractMoney, ZERO_MONEY } from './money';

/**
 * Admin debt is the money the business is holding on a customer's behalf for an
 * item that has been paid for (in full or in part) but not yet handed over.
 *
 * It is a real liability: if the customer walks away, this is the refund amount.
 * It is therefore the amount PAID, not the amount still outstanding.
 *
 * Once the item is delivered the goods have changed hands and the cash is
 * earned, so the liability drops to zero. A cancelled record owes nothing.
 */
export interface PrepaidAdminDebtInput {
  kind: DebtKind;
  prepaidStatus: PrepaidPurchaseStatus | null | undefined;
  isCancelled: boolean;
  totalPaid: MoneyInput;
}

export function isPrepaidAdminDebtActive(input: {
  kind: DebtKind;
  prepaidStatus: PrepaidPurchaseStatus | null | undefined;
  isCancelled: boolean;
}): boolean {
  if (input.kind !== DebtKind.PREPAID_PURCHASE) return false;
  if (input.isCancelled) return false;
  // A prepaid debt with no companion row predates the delivery feature and is
  // treated as awaiting delivery, matching the migration backfill.
  return (
    input.prepaidStatus === PrepaidPurchaseStatus.PENDING ||
    input.prepaidStatus === null ||
    input.prepaidStatus === undefined
  );
}

/** Negative while awaiting delivery, zero once delivered or cancelled. */
export function calculatePrepaidAdminDebt(input: PrepaidAdminDebtInput): Decimal {
  if (!isPrepaidAdminDebtActive(input)) return ZERO_MONEY;
  return subtractMoney(ZERO_MONEY, input.totalPaid);
}

/**
 * What the customer still has to pay before the item is fully covered.
 * Informational only: it is not a receivable until the item is delivered, at
 * which point it is converted into a STANDARD debt with a real due date.
 */
export function calculatePrepaidRemainingToCollect(input: {
  fullAmount: MoneyInput;
  totalPaid: MoneyInput;
}): Decimal {
  const remaining = subtractMoney(input.fullAmount, input.totalPaid);
  return remaining.isNegative() ? ZERO_MONEY : parseMoney(remaining);
}
