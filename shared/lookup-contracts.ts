import type { CustomerSummary } from './mobile-contracts';

/** Read projections of the existing desktop wire contracts; decimal money stays a string. */
export type Currency = 'USD' | 'LBP';
export interface ReadPage<T> {
  items: T[];
  nextPage: number | undefined;
}
export interface DateRange {
  from: string;
  to: string;
}
export interface DashboardRead {
  meta: { businessDate: string; range: DateRange; generatedAt: string };
  data: {
    inventoryScope?: 'all-branches';
    kpis: { key: string; value: string | number; valueKind: 'money' | 'count' }[];
  };
}
export interface ProductRead {
  id: string;
  name: string;
  sku: string;
  model: string;
  barcode: string | null;
  brand: string | null;
  categoryPath?: string | null;
  isActive: boolean;
  price: string | null;
  netPrice: string | null;
  discount: string | null;
  priceCurrency?: Currency;
  stockQuantity: number;
  stockStatus: string;
  trackStock: boolean;
  notes: string | null;
  pricing?: {
    pricingAvailable: boolean;
    cashPrice?: string;
    cashPriceExVat?: string;
    cashPriceIncVat?: string;
    vatAmount?: string;
    taxRatePercent?: string;
    installmentPrice?: string;
    monthlyPayment?: string;
    installmentMonths?: number;
    reason?: string;
    /** Sent by the PC to administrators only (products.service.ts). */
    costPrice?: string | null;
  };
}
export interface StockMovementRead {
  id: string;
  movementType: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  note: string | null;
  createdAt: string;
}
export interface InventoryRead {
  product: {
    stockQuantity: number;
    trackStock: boolean;
    stockStatus: string;
    lowStockThreshold: number | null;
  };
  onboardingStatus: string;
  recentMovements: StockMovementRead[];
}
export interface CategoryRead {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
  assignable: boolean;
}
export interface BrandRead {
  canonical: string;
  productCount: number;
}
export interface CustomerRead extends CustomerSummary {
  address: string | null;
  notes: string | null;
  financial?: {
    outstanding: string;
    overdueAmount: string;
    totalPaid: string;
    tier: string;
  } | null;
}
export interface CustomerFinancialRead {
  businessDate?: string;
  customer: CustomerSummary;
  summary: {
    totalOutstanding: string;
    singleDebtOutstanding: string;
    installmentPlanOutstanding: string;
    totalPaid: string;
    totalObligated?: string;
    overdueAmount?: string;
    nextDueDate: string | null;
    nextDueAmount: string;
    activeDebtCount: number;
    activePlanCount: number;
    totalPrepaidAdminDebt?: string;
    activePrepaidCount?: number;
    lastPaymentDate?: string | null;
  };
  debts: {
    id: string;
    description: string;
    originalAmount: string;
    remainingBalance: string;
    totalPaid: string;
    dueDate: string;
    calculatedStatus: string;
  }[];
  installmentPlans: {
    id: string;
    description: string;
    totalAmount: string;
    remainingBalance: string;
    totalPaid: string;
    nextDueDate: string | null;
    calculatedStatus: string;
  }[];
}
export interface StatementEntryRead {
  id: string;
  type: string;
  date: string;
  description: string;
  reference: string | null;
  originalAmount: string;
  currency: Currency;
  baseAmount: string;
  balanceEffect: string;
  runningBalance: string;
  status: string;
  dueDate: string | null;
}
export interface StatementRead {
  businessDate: string;
  currency: Currency;
  range: DateRange;
  openingBalance: string;
  closingBalance: string;
  entries: StatementEntryRead[];
  aging?: {
    asOf: string;
    total: string;
    buckets: { key: string; label: string; amount: string }[];
  };
}
export interface SupplierRead {
  id: string;
  branchId?: string;
  name: string;
  phone: string;
  companyName: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  balance: string;
  summary?: { totalOwed: string; totalPaid: string; totalCredit: string; balance: string };
}
export interface PurchaseRead {
  id: string;
  receiptNumber: string | null;
  transactionDate: string;
  dueDate?: string | null;
  amount: string;
  description: string;
  status: string;
  currency?: Currency;
  /** Set when the purchase received stock; only these purchases can hold a bill. */
  supplierReceivingId?: string | null;
}
export interface BillRead {
  id: string;
  supplierId: string;
  branchId: string;
  supplierReceivingId: string | null;
  /** PC 2.3.0+: a payment, or a purchase with no received stock. */
  supplierTransactionId?: string | null;
  billGroupId?: string | null;
  pageNumber?: number;
  capturedById?: string;
  note: string | null;
  mime: string;
  bytes: number;
  capturedAt: string;
  /** PC 2.3.0+: every page of this bill, in order. Older PCs send one page per bill. */
  pages?: BillRead[];
  pageCount?: number;
}
export interface SalesOrderRead {
  id: string;
  branchId?: string;
  orderNumber: string;
  orderDate: string;
  deliveryDate: string | null;
  customerId: string | null;
  customer: { id: string; name: string; phone: string; address: string | null } | null;
  fulfillmentStatus: string;
  paymentStatus: string;
  settlement: string;
  salesChannel: string;
  currency: Currency;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  subtotalExVat: string;
  vatAmount: string;
  deliveryFeeIncVat: string;
  notes: string | null;
  deliveryAddressSnapshot: string | null;
  deliveryNotes: string | null;
  items: {
    id: string;
    productNameSnapshot: string;
    skuSnapshot: string | null;
    quantity: number;
    unitPrice: string;
    vatAmount: string;
    lineTotalIncVat: string;
  }[];
}
