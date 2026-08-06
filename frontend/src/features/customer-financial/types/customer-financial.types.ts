export type DebtStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'PAID' | 'CANCELLED';
export type DebtKind = 'STANDARD' | 'PREPAID_PURCHASE';
export type InstallmentPlanStatus = 'ACTIVE' | 'OVERDUE' | 'COMPLETED' | 'CANCELLED';
export type InstallmentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'OVERDUE' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHECK' | 'OTHER';
export type FinancialItemType = 'DEBT' | 'INSTALLMENT';
export type PaymentAllocationTargetType = FinancialItemType | 'UNKNOWN';
export type FinancialCorrectionSourceScreen =
  | 'CUSTOMER_PROFILE'
  | 'LEDGER'
  | 'PLAN_DETAILS'
  | 'REPORTS'
  | 'PREPAID'
  | 'API';

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: {
    timestamp?: string;
  };
}

export type CustomerFinancialSummaryResponse = ApiEnvelope<CustomerFinancialSummary>;

export interface CustomerFinancialSummary {
  businessDate?: string;
  customer: FinancialSummaryCustomer;
  summary: FinancialSummaryTotals;
  debts: DebtSummaryItem[];
  installmentPlans: InstallmentPlanSummaryItem[];
  overdueItems: OverdueFinancialItem[];
  nextDue: NextDueSummary | null;
  recentPayments: RecentFinancialPayment[];
}

export interface FinancialSummaryCustomer {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface FinancialSummaryTotals {
  totalOutstanding: string;
  singleDebtOutstanding: string;
  installmentPlanOutstanding: string;
  totalPrepaidAdminDebt: string;
  totalPaid: string;
  activeDebtCount: number;
  activePrepaidCount: number;
  activePlanCount: number;
  overdueDebtCount: number;
  overdueInstallmentCount: number;
  nextDueDate: string | null;
  nextDueAmount: string;
  totalObligated?: string;
  overdueAmount?: string;
  lastPaymentDate?: string | null;
  daysSinceLastPayment?: number | null;
  month?: { debtAdded: string; paid: string; remaining: string; isSettled: boolean };
}

export interface FinancialUserSummary {
  id: string;
  name: string;
  username: string;
}

export interface FinancialCancellationSummary {
  cancelledAt: string;
  reason: string | null;
  cancelledBy: FinancialUserSummary | null;
}

export interface DebtSummaryItem {
  id: string;
  kind: DebtKind;
  description: string;
  originalAmount: string;
  totalPaid: string;
  remainingBalance: string;
  adminDebt: string;
  dueDate: string;
  status: DebtStatus;
  calculatedStatus: DebtStatus;
  storedStatus: DebtStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: FinancialUserSummary;
  cancellation: FinancialCancellationSummary | null;
}

export interface InstallmentPlanSummaryItem {
  id: string;
  description: string;
  totalAmount: string;
  totalPaid: string;
  remainingBalance: string;
  startDate: string;
  installmentCount: number;
  frequency: 'MONTHLY' | 'WEEKLY';
  completedInstallmentCount: number;
  overdueInstallmentCount: number;
  nextDueDate: string | null;
  status: InstallmentPlanStatus;
  calculatedStatus: InstallmentPlanStatus;
  storedStatus: InstallmentPlanStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: FinancialUserSummary;
  cancellation: FinancialCancellationSummary | null;
  scheduleSummary: {
    totalInstallments: number;
    completedInstallments: number;
    remainingInstallments: number;
    nextInstallment: {
      id: string;
      installmentNumber: number;
      dueDate: string;
      remainingAmount: string;
      status: InstallmentStatus;
    } | null;
  };
}

export interface OverdueFinancialItem {
  type: FinancialItemType;
  obligationId: string;
  planId: string | null;
  description: string;
  dueDate: string;
  originalDueAmount: string;
  paidAmount: string;
  remainingAmount: string;
  daysOverdue: number;
  calculatedStatus: DebtStatus | InstallmentStatus;
}

export interface NextDueSummary {
  date: string;
  totalAmount: string;
  items: Array<{
    type: FinancialItemType;
    id: string;
    planId: string | null;
    description: string;
    remainingAmount: string;
  }>;
}

export interface RecentFinancialPayment {
  id: string;
  totalAmount: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  reference: string | null;
  notes: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  createdBy: FinancialUserSummary;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: FinancialUserSummary | null;
  allocations: PaymentAllocationSummary[];
}

export interface PaymentAllocationSummary {
  id: string;
  targetType: PaymentAllocationTargetType;
  debtId: string | null;
  installmentId: string | null;
  planId: string | null;
  description: string | null;
  amount: string;
  createdAt: string;
}

export interface CustomerFinancialSummaryOptions {
  includeCancelled?: boolean;
  includePayments?: boolean;
  paymentLimit?: number;
  debtLimit?: number;
  planLimit?: number;
  month?: string;
}

export interface DebtDetail extends DebtSummaryItem {
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  payments: RecentFinancialPayment[];
}

export interface InstallmentDetail {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amountDue: string;
  totalPaid: string;
  remainingAmount: string;
  status: InstallmentStatus;
  storedStatus: InstallmentStatus;
  paidDate: string | null;
}

export interface InstallmentPlanDetail extends Omit<InstallmentPlanSummaryItem, 'scheduleSummary'> {
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  schedule: InstallmentDetail[];
  payments: RecentFinancialPayment[];
}

export interface CreateDebtRequest {
  amount: string;
  description: string;
  dueDate: string;
  notes?: string | null;
}

export interface CreatePrepaidPurchaseRequest {
  itemName: string;
  paymentAmount: string;
  fullAmount: string;
  notes?: string | null;
}

export interface RecordDebtPaymentRequest {
  amount: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey: string;
}

export interface UpdateDebtRequest {
  originalAmount?: string;
  description: string;
  dueDate: string;
  notes?: string | null;
  reason: string;
  sourceScreen: FinancialCorrectionSourceScreen;
  accountPassword: string;
}

export interface CancelFinancialRecordRequest {
  reason: string;
  accountPassword: string;
}

export interface VoidPaymentRequest {
  reason: string;
  sourceScreen: FinancialCorrectionSourceScreen;
  accountPassword: string;
}

export interface ReallocatePaymentRequest {
  allocations: Array<{
    installmentId: string;
    amount: string;
  }>;
  reason: string;
  sourceScreen: FinancialCorrectionSourceScreen;
  accountPassword: string;
}

export interface CreateInstallmentPlanRequest {
  totalAmount: string;
  description: string;
  startDate: string;
  installmentCount: number;
  frequency: 'MONTHLY' | 'WEEKLY';
  notes?: string | null;
  schedule?: Array<{
    amountDue: string;
  }>;
}

export interface UpdateInstallmentPlanRequest {
  totalAmount?: string;
  description: string;
  startDate?: string;
  installmentCount?: number;
  notes?: string | null;
  reason: string;
  sourceScreen: FinancialCorrectionSourceScreen;
  accountPassword: string;
}

export interface RecordInstallmentPlanPaymentRequest {
  amount: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey: string;
}
