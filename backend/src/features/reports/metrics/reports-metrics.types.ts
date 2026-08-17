export interface ReportsCustomerReference {
  id: string;
  name: string;
  phone: string;
}

export interface ReportsCustomerMetrics {
  newCustomers: number;
  activeCustomers: number;
  paidCount: number;
  didNotPayCount: number;
  didNotPay: ReportsCustomerReference[];
}

export interface ReportsSalesPeriodMetrics {
  orderCount: number;
  totalAmount: string;
  paidAmount: string;
  unpaidAmount: string;
  averageOrderValue: string;
}

export interface ReportsCoreMetrics {
  sales: ReportsSalesPeriodMetrics;
  customers: ReportsCustomerMetrics;
}
