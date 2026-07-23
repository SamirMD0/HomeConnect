export interface DashboardSummary {
  totalCustomers: number;
  customersWithDebt: number;
  totalDebt: number;
  paymentsToday: number;
  paymentsThisMonth: number;
  salesToday: number;
  salesThisMonth: number;
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
  details: Record<string, any>;
  ipAddress?: string;
  createdAt: string;
  branchId?: string;
}
