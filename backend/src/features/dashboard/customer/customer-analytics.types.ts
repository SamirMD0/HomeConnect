export interface CustomerTrendPoint {
  bucket: string;
  collected: string;
  newDebt: string;
}

export interface CustomerMonthlyPoint {
  month: string;
  collected: string;
  newDebt: string;
}

export interface CustomerTopDebtor {
  branchId?:string; branchName?:string;
  customerId: string;
  customerName: string;
  phone: string;
  outstanding: string;
}

export interface CustomerAgeBucket {
  key: 'CURRENT' | 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'DAYS_90_PLUS';
  label: string;
  amount: string;
  count: number;
}

export interface CustomerAnalyticsData {
  totals: {
    totalCustomers: number;
    collected: string;
    distinctPayers: number;
    newDebt: string;
    /** What customers owe overall: debts minus their credit balances, as the old system counts. */
    outstanding: string;
    /** Open debts before any credit. */
    debts: string;
    /** Credit balances carried over from the old system (imported deposits still held). */
    customerCredit: string;
    /** Money paid ahead for goods not yet delivered; not a credit against debts. */
    prepaidHeld: string;
    customersWithBalance: number;
    overdueCustomers: number;
    netMovement: string;
  };
  today: {
    collected: string;
    distinctPayers: number;
    newDebt: string;
  };
  trend: CustomerTrendPoint[];
  monthlyComparison: CustomerMonthlyPoint[];
  ageDistribution: CustomerAgeBucket[];
  topDebtors?: CustomerTopDebtor[];
}
