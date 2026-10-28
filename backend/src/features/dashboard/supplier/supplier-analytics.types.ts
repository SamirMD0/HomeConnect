export interface SupplierTrendPoint {
  bucket: string;
  paid: string;
}

export interface SupplierBalanceItem {
  branchId?:string; branchName?:string;
  supplierId: string;
  supplierName: string;
  companyName: string | null;
  balance: string;
}

export interface SupplierAnalyticsData {
  totals: {
    owed: string;
    paid: string;
    paidToday: string;
    suppliersWithBalance: number;
  };
  trend: SupplierTrendPoint[];
  topBalances: SupplierBalanceItem[];
}

