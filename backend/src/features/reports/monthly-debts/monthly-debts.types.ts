export type MonthlyDebtReportMode = 'SNAPSHOT';
export type MonthlyDebtSortBy = 'CUSTOMER' | 'OUTSTANDING' | 'OVERDUE' | 'LAST_PAYMENT';
export type MonthlyDebtSortOrder = 'ASC' | 'DESC';

export interface MonthlyDebtCustomer {
  id: string;
  name: string;
  phone: string;
}

export interface MonthlyDebtReportRow {
  customer: MonthlyDebtCustomer;
  singleDebtOutstanding: string;
  installmentPlanOutstanding: string;
  totalOutstanding: string;
  amountDueByCutoff: string;
  overdueAmountAtCutoff: string;
  activeDebtCount: number;
  activePlanCount: number;
  overdueDebtCount: number;
  overdueInstallmentCount: number;
  lastPaymentDate: string | null;
  nextDueDateAfterCutoff: string | null;
}

export interface MonthlyDebtReportSummary {
  month: string;
  cutoffDate: string;
  customerCount: number;
  totalOutstanding: string;
  singleDebtOutstandingTotal: string;
  installmentPlanOutstandingTotal: string;
  totalAmountDueByCutoff: string;
  totalOverdueAtCutoff: string;
  totalPaymentsReceivedDuringMonth: string;
  customersWithOverdueDebt: number;
  customersWithActiveInstallmentPlans: number;
}

export interface MonthlyDebtReport {
  mode: MonthlyDebtReportMode;
  summary: MonthlyDebtReportSummary;
  rows: MonthlyDebtReportRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface MonthlyFinancialActivityItem {
  id: string;
  customer: MonthlyDebtCustomer;
  type: 'DEBT_CREATED' | 'INSTALLMENT_PLAN_CREATED' | 'PAYMENT_RECEIVED';
  date: string;
  description: string;
  amount: string;
}

export interface MonthlyFinancialActivitySummary {
  month: string;
  startDate: string;
  endDate: string;
  newSingleDebtAmount: string;
  newInstallmentPlanAmount: string;
  paymentsReceived: string;
  netFinancialChange: string;
  debtsCreated: number;
  plansCreated: number;
  payments: number;
  customerCountAffected: number;
}

export interface MonthlyFinancialActivityReport {
  summary: MonthlyFinancialActivitySummary;
  items: MonthlyFinancialActivityItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
