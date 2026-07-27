export interface DashboardFinancialMoneyCards {
  totalOutstanding: string;
  paymentsToday: string;
  paymentsThisMonth: string;
  obligationsCreatedToday: string;
  obligationsCreatedThisMonth: string;
  netChangeToday: string;
  netChangeThisMonth: string;
}

export interface DashboardFinancialCustomerCounts {
  totalCustomers: number;
  customersWithOutstanding: number;
}

export interface DashboardFinancialCustomerView {
  id: string;
  name: string;
  phone: string;
}

export interface DashboardUpcomingDueItem {
  type: 'DEBT' | 'INSTALLMENT';
  id: string;
  parentId: string | null;
  customer: DashboardFinancialCustomerView;
  description: string;
  dueDate: string;
  remainingAmount: string;
  status: string;
}

export interface DashboardOverdueCustomer {
  customer: DashboardFinancialCustomerView;
  overdueItemCount: number;
  totalOverdue: string;
}

export interface DashboardRecentPayment {
  id: string;
  customer: DashboardFinancialCustomerView;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  allocationCount: number;
}

export interface DashboardFinancialSummaryView {
  businessDate: string;
  monthStart: string;
  counts: DashboardFinancialCustomerCounts;
  money: DashboardFinancialMoneyCards;
  upcomingDue: DashboardUpcomingDueItem[];
  overdueCustomers: DashboardOverdueCustomer[];
  recentPayments: DashboardRecentPayment[];
}
