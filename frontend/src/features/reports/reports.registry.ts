import {
  Activity, Banknote, Boxes, CircleDollarSign, ClipboardList, FileText, Hourglass,
  PackageSearch, ReceiptText, ScrollText, ShoppingCart, Truck, UserCheck, UserPlus,
  UserX, Users, ShieldCheck, TrendingUp, Wallet, BarChart3, PiggyBank, Warehouse, AlertTriangle, BadgeCheck, BadgeX,
  type LucideIcon,
} from 'lucide-react';
import type { MonthlyReviewData } from './types/monthly-review.types';
import type { ReportSlice } from './types/report-rows.types';

export type ReportCategory = 'overview' | 'sales' | 'finance' | 'customers' | 'suppliers' | 'inventory';

/**
 * How a report renders its body. `rows` reports are all served by the same
 * row-level endpoint family and differ only in their columns; the other three
 * kinds each have a bespoke body that predates it.
 */
export type ReportKind = 'review' | 'analysis' | 'rows' | 'legacy-debts' | 'legacy-activity';

export interface ReportHeadline {
  label: string;
  value: string;
  money?: boolean;
}

export interface ReportDefinition {
  /** URL slug: /reports/<id> */
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  category: ReportCategory;
  kind: ReportKind;
  slice?: ReportSlice;
  /** True when the rows are a live backlog rather than a record of the period. */
  operational?: boolean;
  /**
   * Optional figure shown on the portal card. It is READ from the backend
   * monthly-review envelope — never computed here. A card without a matching
   * backend field simply shows no number rather than an invented one.
   */
  headline?: (data: MonthlyReviewData) => ReportHeadline | null;
}

export const reportCategories: Array<{ key: ReportCategory; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'sales', label: 'Sales' },
  { key: 'finance', label: 'Cash & profit' },
  { key: 'customers', label: 'Customers' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'inventory', label: 'Inventory' },
];

export const reportDefinitions: ReportDefinition[] = [
  {
    id: 'sales-summary',
    title: 'Sales Summary',
    description: 'Day by day: orders, gross sales, returns, net sales, money collected, and what was left unpaid.',
    icon: BarChart3,
    category: 'sales',
    kind: 'rows',
    slice: 'sales-summary',
    headline: (data) => ({ label: 'Net sales', value: data.sales.netSalesAmount ?? data.sales.totalAmount, money: true }),
  },
  {
    id: 'sales-by-product',
    title: 'Sales by Product',
    description: 'Units sold, returns, VAT and net sales for each product, best sellers first.',
    icon: PackageSearch,
    category: 'sales',
    kind: 'rows',
    slice: 'sales-by-product',
  },
  {
    id: 'sales-by-customer',
    title: 'Sales by Customer',
    description: 'Orders, sales, payments and the balance still owed for each customer, with their share of total sales.',
    icon: Users,
    category: 'sales',
    kind: 'rows',
    slice: 'sales-by-customer',
  },
  {
    id: 'cash-flow',
    title: 'Cash Flow',
    description: 'Money in from customers against money out to suppliers and refunds, by payment method and day by day.',
    icon: Wallet,
    category: 'finance',
    kind: 'rows',
    slice: 'cash-flow',
  },
  {
    id: 'profit',
    title: 'Gross Profit',
    description: 'Net sales minus cost of goods for each product, with margin. Uses each product\'s current cost price.',
    icon: PiggyBank,
    category: 'finance',
    kind: 'rows',
    slice: 'profit',
  },
  {
    id: 'suppliers-paid',
    title: 'Suppliers Paid',
    description: 'Suppliers we paid in the period: what we owed at the start, new bills, payments, and what we still owe.',
    icon: BadgeCheck,
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-paid',
  },
  {
    id: 'suppliers-not-paid',
    title: 'Suppliers Not Paid',
    description: 'Suppliers we still owe but did not pay at all in the period, largest balance first.',
    icon: BadgeX,
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-not-paid',
  },
  {
    id: 'inventory-valuation',
    title: 'Stock Valuation',
    description: 'What the stock on hand is worth at cost and at selling price, product by product. A live snapshot.',
    icon: Warehouse,
    category: 'inventory',
    kind: 'rows',
    slice: 'inventory-valuation',
    operational: true,
  },
  {
    id: 'low-stock',
    title: 'Low Stock and Reorder',
    description: 'Products at or below their reorder level, with recent sales and a suggested order quantity. A live snapshot.',
    icon: AlertTriangle,
    category: 'inventory',
    kind: 'rows',
    slice: 'inventory-low-stock',
    operational: true,
  },
  {
    id: 'monthly-review',
    title: 'Monthly Review',
    description: 'Sales, customer and supplier movement, inventory, and risk for the selected period, with a comparison against the previous period.',
    icon: ClipboardList,
    category: 'overview',
    kind: 'review',
    headline: (data) => ({ label: 'Sales', value: data.sales.totalAmount, money: true }),
  },
  {
    id: 'analysis',
    title: 'Analysis Portal',
    description: 'Compares customer debt, supplier debt, sales, and inventory against the previous period, and explains the risks it finds.',
    icon: Activity,
    category: 'overview',
    kind: 'analysis',
    headline: (data) => ({ label: 'Receivables', value: data.customers.movement.closing, money: true }),
  },
  {
    id: 'receivables-aging',
    title: 'Receivables Aging',
    description: 'Every unpaid debt banded by how long it has been outstanding since it was raised, from 0–7 days through 90+.',
    icon: Hourglass,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-aging',
    headline: (data) => ({ label: 'Outstanding', value: data.customers.movement.closing, money: true }),
  },
  {
    id: 'customers-not-paid',
    title: 'Customers Who Did Not Pay',
    description: 'Customers carrying a balance who made no payment in the period, with their movement and risk labels.',
    icon: UserX,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-not-paid',
    headline: (data) => ({ label: 'Did not pay', value: String(data.customers.didNotPayCount) }),
  },
  {
    id: 'customers-paid',
    title: 'Customers Who Paid',
    description: 'Customers who paid during the period, how much they paid, and what they still owe.',
    icon: UserCheck,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-paid',
    headline: (data) => ({ label: 'Paid', value: String(data.customers.paidCount) }),
  },
  {
    id: 'products-bought',
    title: 'Products Bought',
    description: 'Product lines received from suppliers in the period, in quantities. Receiving carries no cost, so no purchase value is shown.',
    icon: PackageSearch,
    category: 'inventory',
    kind: 'rows',
    slice: 'products-bought',
  },
  {
    id: 'product-cost-changes',
    title: 'Product Cost Changes',
    description: 'Audited cost changes with old/new selling price, pricing mode, actor, and source purchase.',
    icon: TrendingUp,
    category: 'inventory',
    kind: 'rows',
    slice: 'products-cost-changes',
  },
  {
    id: 'new-customers',
    title: 'New Customers',
    description: 'Every customer added during the period, with phone and account status.',
    icon: UserPlus,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-new',
    headline: (data) => ({ label: 'New this period', value: String(data.customers.newCustomers) }),
  },
  {
    id: 'customer-debts',
    title: 'Customer Debts',
    description: 'What each customer still owes at the end of the period, with amounts due, overdue, and the date they last paid.',
    icon: CircleDollarSign,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-debts',
    headline: (data) => ({ label: 'Closing balance', value: data.customers.movement.closing, money: true }),
  },
  {
    id: 'customer-financial-integrity',
    title: 'Customer Financial Integrity',
    description: 'Compares the customer balance shown by Home Connect with an independent sum of obligations minus live payment allocations.',
    icon: ShieldCheck,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-financial-integrity',
    operational: true,
  },
  {
    id: 'customer-payments',
    title: 'Customer Payments',
    description: 'Every payment collected during the period, with method and reference.',
    icon: Banknote,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-payments',
    headline: (data) => ({ label: 'Collected', value: data.customers.movement.collected, money: true }),
  },
  {
    id: 'customer-debt-snapshot',
    title: 'Customer Debt Snapshot',
    description: 'Point-in-time month-end snapshot per customer, including installment plans and overdue counts.',
    icon: ScrollText,
    category: 'customers',
    kind: 'legacy-debts',
  },
  {
    id: 'financial-activity',
    title: 'Financial Activity',
    description: 'Every debt, installment plan, and payment created during a month, in date order.',
    icon: FileText,
    category: 'customers',
    kind: 'legacy-activity',
  },
  {
    id: 'supplier-debts',
    title: 'Supplier Ledger',
    description: 'Supplier debts and payments posted during the period, with receipt numbers and running direction.',
    icon: Truck,
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-debts',
    headline: (data) => ({ label: 'Closing owed', value: data.suppliers.movement.closing, money: true }),
  },
  {
    id: 'supplier-aging',
    title: 'Supplier Payables Aging',
    description: 'Current payables after report-only FIFO settlement, by due date; unscheduled balances and excess credit remain visible. Stored base USD values; no ledger changes.',
    icon: Truck,
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-aging',
    operational: true,
  },
  {
    id: 'supplier-financial-integrity',
    title: 'Supplier Financial Integrity',
    description: 'Compares each displayed supplier balance with an independent sum of active increases minus active decreases.',
    icon: ShieldCheck,
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-financial-integrity',
    operational: true,
  },
  {
    id: 'supplier-receiving',
    title: 'Supplier Receiving',
    description: 'Receiving documents posted in the period, their line and quantity totals, and any linked supplier debt.',
    icon: ReceiptText,
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-receiving',
  },
  {
    id: 'sales',
    title: 'Sales Report',
    description: 'Every sales order in the period with payment and fulfillment status, total, paid, and remaining.',
    icon: ShoppingCart,
    category: 'sales',
    kind: 'rows',
    slice: 'sales-orders',
    headline: (data) => ({ label: 'Orders', value: String(data.sales.orderCount) }),
  },
  {
    id: 'unpaid-sales',
    title: 'Unpaid Sales',
    description: 'Sales orders that still carry a balance. This is a live backlog, not a record of the selected period.',
    icon: Users,
    category: 'sales',
    kind: 'rows',
    slice: 'sales-unpaid',
    operational: true,
    headline: (data) => ({ label: 'Unpaid', value: data.sales.unpaidAmount, money: true }),
  },
  {
    id: 'stock-movements',
    title: 'Stock Movements',
    description: 'Every stock movement in the period by type, with the balance before and after each change.',
    icon: Boxes,
    category: 'inventory',
    kind: 'rows',
    slice: 'inventory-movements',
  },
  {
    id: 'receiving-reconciliation',
    title: 'Receiving Reconciliation',
    description: 'Checks each received line against the stock movement that recorded it, and lists any that disagree.',
    icon: PackageSearch,
    category: 'inventory',
    kind: 'rows',
    slice: 'inventory-reconciliation',
  },
];

export function findReport(id: string | undefined): ReportDefinition | undefined {
  return reportDefinitions.find((definition) => definition.id === id);
}

export function reportsInCategory(category: ReportCategory): ReportDefinition[] {
  return reportDefinitions.filter((definition) => definition.category === category);
}
