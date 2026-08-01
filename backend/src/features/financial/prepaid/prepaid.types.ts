import { PrepaidPurchaseStatus } from '@prisma/client';

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
  deliveredBy: {
    id: string;
    name: string;
    username: string;
  } | null;
  remainderDebtId: string | null;
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
