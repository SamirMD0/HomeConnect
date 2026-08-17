import { PaymentMethod, PrepaidPurchaseStatus } from '@prisma/client';

export interface PrepaidUserView {
  id: string;
  name: string;
  username: string;
}

/**
 * One prepaid bill: a single payment the customer made towards this item.
 * A prepaid purchase normally has several, and every one of them is kept.
 */
export interface PrepaidPaymentView {
  /** Allocation id: what ties this payment to this prepaid purchase. */
  id: string;
  paymentId: string;
  /** The portion of the payment allocated to this prepaid purchase. */
  amount: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  /** Receipt or bill number, when the operator recorded one. */
  reference: string | null;
  notes: string | null;
  recordedBy: PrepaidUserView | null;
  /** Voided bills stay in history but are excluded from `amountPaid`. */
  isVoided: boolean;
  createdAt: string;
}

export interface PrepaidPurchaseView {
  id: string;
  debtId: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  itemName: string;
  /** Full price of the item. */
  fullAmount: string;
  /** Cash received so far, from non-voided allocations. */
  amountPaid: string;
  /** Negative while awaiting delivery, "0.00" once delivered or cancelled. */
  adminDebt: string;
  /** Not a receivable until the item is delivered. */
  remainingToCollect: string;
  /** Preserved when the underlying prepaid debt is corrected. */
  dueDate: string;
  isFullyPaid: boolean;
  status: PrepaidPurchaseStatus;
  notes: string | null;
  deliveredAt: string | null;
  deliveryNotes: string | null;
  deliveredBy: PrepaidUserView | null;
  remainderDebtId: string | null;
  /** Who recorded the prepaid purchase. */
  createdBy: PrepaidUserView | null;
  /** Every bill paid towards this item, oldest first. Voided ones included. */
  payments: PrepaidPaymentView[];
  /** Bills that still count towards `amountPaid`. */
  paymentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrepaidPurchaseSummary {
  /** Total the business owes customers. Counts awaiting-delivery records only. */
  totalAdminDebt: string;
  totalFullAmount: string;
  totalRemainingToCollect: string;
  pendingCount: number;
  deliveredCount: number;
  cancelledCount: number;
  /** Distinct customers with at least one record awaiting delivery. */
  customerCount: number;
  basis: 'filtered';
}

export interface PrepaidPurchaseListResult {
  summary: PrepaidPurchaseSummary;
  items: PrepaidPurchaseView[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
