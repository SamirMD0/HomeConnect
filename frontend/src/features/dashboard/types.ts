export interface DashboardFinancialSummary {
  businessDate: string;
  monthStart: string;
  counts: {
    totalCustomers: number;
    customersWithOutstanding: number;
  };
  money: {
    totalOutstanding: string;
    paymentsToday: string;
    paymentsThisMonth: string;
    obligationsCreatedToday: string;
    obligationsCreatedThisMonth: string;
    netChangeToday: string;
    netChangeThisMonth: string;
  };
  upcomingDue: DashboardUpcomingDueItem[];
  overdueCustomers: DashboardOverdueCustomer[];
  recentPayments: DashboardRecentPayment[];
}

export interface DashboardCustomer {
  id: string;
  name: string;
  phone: string;
}

export interface DashboardUpcomingDueItem {
  type: 'DEBT' | 'INSTALLMENT';
  id: string;
  parentId: string | null;
  customer: DashboardCustomer;
  description: string;
  dueDate: string;
  remainingAmount: string;
  status: string;
}

export interface DashboardOverdueCustomer {
  customer: DashboardCustomer;
  overdueItemCount: number;
  totalOverdue: string;
}

export interface DashboardRecentPayment {
  id: string;
  customer: DashboardCustomer;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  allocationCount: number;
}

export interface ActivityLog {
  id: string;
  userId: string;
  user: {
    fullName: string;
    username: string;
  };
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
  branchId?: string;
}
