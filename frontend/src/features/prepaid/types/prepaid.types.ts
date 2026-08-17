export type PrepaidStatus = 'PENDING' | 'DELIVERED' | 'CANCELLED';
export type PrepaidStatusFilter = 'ALL' | PrepaidStatus;
export type PrepaidSortBy = 'createdAt' | 'customerName' | 'adminDebt';
export type PrepaidSortOrder = 'asc' | 'desc';

export interface PrepaidCustomer {
  id: string;
  name: string;
  phone: string;
}

export interface PrepaidUser {
  id: string;
  name: string;
  username: string;
}

export type PrepaidPaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';

/** One prepaid bill paid towards an item. A purchase normally has several. */
export interface PrepaidPayment {
  id: string;
  paymentId: string;
  amount: string;
  paymentDate: string;
  paymentMethod: PrepaidPaymentMethod;
  /** Receipt or bill number, when one was recorded. */
  reference: string | null;
  notes: string | null;
  recordedBy: PrepaidUser | null;
  /** Kept in history, excluded from the balance. */
  isVoided: boolean;
  createdAt: string;
}

export interface PrepaidPurchase {
  id: string;
  debtId: string;
  customer: PrepaidCustomer;
  itemName: string;
  fullAmount: string;
  amountPaid: string;
  /** Negative while awaiting delivery: the cash the business is holding. */
  adminDebt: string;
  remainingToCollect: string;
  dueDate: string;
  isFullyPaid: boolean;
  status: PrepaidStatus;
  notes: string | null;
  deliveredAt: string | null;
  deliveryNotes: string | null;
  deliveredBy: PrepaidUser | null;
  remainderDebtId: string | null;
  createdBy: PrepaidUser | null;
  /** Every bill paid towards this item, oldest first. */
  payments: PrepaidPayment[];
  /** Bills that still count towards the balance. */
  paymentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrepaidSummary {
  totalAdminDebt: string;
  totalFullAmount: string;
  totalRemainingToCollect: string;
  pendingCount: number;
  deliveredCount: number;
  cancelledCount: number;
  customerCount: number;
  basis: 'filtered';
}

export interface PrepaidPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PrepaidListData {
  summary: PrepaidSummary;
  items: PrepaidPurchase[];
  pagination: PrepaidPagination;
}

export interface PrepaidListResponse {
  success: boolean;
  data: PrepaidListData;
}

export interface PrepaidDetailResponse {
  success: boolean;
  data: PrepaidPurchase;
}

export interface PrepaidFilters {
  status?: PrepaidStatusFilter;
  customerId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  fullyPaidOnly?: boolean;
  sortBy?: PrepaidSortBy;
  sortOrder?: PrepaidSortOrder;
  page?: number;
  pageSize?: number;
}

export interface DeliverPrepaidPayload {
  remainderDueDate?: string | null;
  deliveryNotes?: string | null;
}

export interface RevertPrepaidDeliveryPayload {
  reason: string;
  accountPassword: string;
}
