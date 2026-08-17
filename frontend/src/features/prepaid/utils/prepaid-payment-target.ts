import { DebtPaymentTarget } from '../../customer-financial/components/RecordDebtPaymentDialog';
import { PrepaidPurchase } from '../types/prepaid.types';

/**
 * Bills are recorded against the underlying prepaid debt, so the payment dialog
 * is handed the debt, not the prepaid row. Status is derived from what has been
 * paid so far: a fully covered item takes no further bills.
 */
export function toPrepaidPaymentTarget(item: PrepaidPurchase): DebtPaymentTarget {
  const status =
    item.status === 'CANCELLED'
      ? 'CANCELLED'
      : item.isFullyPaid
        ? 'PAID'
        : item.amountPaid === '0.00'
          ? 'UNPAID'
          : 'PARTIALLY_PAID';

  return {
    id: item.debtId,
    description: item.itemName,
    originalAmount: item.fullAmount,
    totalPaid: item.amountPaid,
    remainingBalance: item.remainingToCollect,
    dueDate: item.dueDate,
    status,
    calculatedStatus: status,
    kind: 'PREPAID_PURCHASE',
  };
}
