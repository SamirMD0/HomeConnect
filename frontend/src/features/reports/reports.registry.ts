import {
  Activity, Banknote, Boxes, CircleDollarSign, ClipboardList, FileText, Hourglass,
  PackageSearch, ReceiptText, ScrollText, ShoppingCart, Truck, UserCheck, UserPlus,
  UserX, Users, type LucideIcon,
} from 'lucide-react';
import type { MonthlyReviewData } from './types/monthly-review.types';
import type { ReportSlice } from './types/report-rows.types';

export type ReportCategory = 'overview' | 'customers' | 'suppliers' | 'sales' | 'inventory';

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
  { key: 'overview', label: 'Overview / نظرة عامة' },
  { key: 'customers', label: 'Customers / الزبائن' },
  { key: 'suppliers', label: 'Suppliers / الموردون' },
  { key: 'sales', label: 'Sales / المبيعات' },
  { key: 'inventory', label: 'Inventory / المخزون' },
];

export const reportDefinitions: ReportDefinition[] = [
  {
    id: 'monthly-review',
    title: 'Monthly Review / المراجعة الشهرية',
    description: 'Sales, customer and supplier movement, inventory, and risk for the selected period, with a comparison against the previous period.',
    icon: ClipboardList,
    category: 'overview',
    kind: 'review',
    headline: (data) => ({ label: 'Sales / المبيعات', value: data.sales.totalAmount, money: true }),
  },
  {
    id: 'analysis',
    title: 'Analysis Portal / بوابة التحليل',
    description: 'Compares customer debt, supplier debt, sales, and inventory against the previous period, and explains the risks it finds.',
    icon: Activity,
    category: 'overview',
    kind: 'analysis',
    headline: (data) => ({ label: 'Receivables / الذمم', value: data.customers.movement.closing, money: true }),
  },
  {
    id: 'receivables-aging',
    title: 'Receivables Aging / أعمار ديون الزبائن',
    description: 'Every unpaid debt banded by how long it has been outstanding since it was raised, from 0–7 days through 90+.',
    icon: Hourglass,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-aging',
    headline: (data) => ({ label: 'Outstanding / الرصيد', value: data.customers.movement.closing, money: true }),
  },
  {
    id: 'customers-not-paid',
    title: 'Customers Who Did Not Pay / زبائن لم يدفعوا',
    description: 'Customers carrying a balance who made no payment in the period, with their movement and risk labels.',
    icon: UserX,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-not-paid',
    headline: (data) => ({ label: 'Did not pay / لم يدفعوا', value: String(data.customers.didNotPayCount) }),
  },
  {
    id: 'customers-paid',
    title: 'Customers Who Paid / زبائن دفعوا',
    description: 'Customers who paid during the period, how much they paid, and what they still owe.',
    icon: UserCheck,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-paid',
    headline: (data) => ({ label: 'Paid / دفعوا', value: String(data.customers.paidCount) }),
  },
  {
    id: 'products-bought',
    title: 'Products Bought / المنتجات المشتراة',
    description: 'Product lines received from suppliers in the period, in quantities. Receiving carries no cost, so no purchase value is shown.',
    icon: PackageSearch,
    category: 'inventory',
    kind: 'rows',
    slice: 'products-bought',
  },
  {
    id: 'new-customers',
    title: 'New Customers / زبائن جدد',
    description: 'Every customer added during the period, with phone and account status.',
    icon: UserPlus,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-new',
    headline: (data) => ({ label: 'New this period / جدد', value: String(data.customers.newCustomers) }),
  },
  {
    id: 'customer-debts',
    title: 'Customer Debts / ديون الزبائن',
    description: 'What each customer still owes at the end of the period, with amounts due, overdue, and the date they last paid.',
    icon: CircleDollarSign,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-debts',
    headline: (data) => ({ label: 'Closing balance / الرصيد الختامي', value: data.customers.movement.closing, money: true }),
  },
  {
    id: 'customer-payments',
    title: 'Customer Payments / دفعات الزبائن',
    description: 'Every payment collected during the period, with method and reference.',
    icon: Banknote,
    category: 'customers',
    kind: 'rows',
    slice: 'customers-payments',
    headline: (data) => ({ label: 'Collected / المحصل', value: data.customers.movement.collected, money: true }),
  },
  {
    id: 'customer-debt-snapshot',
    title: 'Customer Debt Snapshot / لقطة ديون الزبائن',
    description: 'Point-in-time month-end snapshot per customer, including installment plans and overdue counts.',
    icon: ScrollText,
    category: 'customers',
    kind: 'legacy-debts',
  },
  {
    id: 'financial-activity',
    title: 'Financial Activity / الحركة المالية',
    description: 'Every debt, installment plan, and payment created during a month, in date order.',
    icon: FileText,
    category: 'customers',
    kind: 'legacy-activity',
  },
  {
    id: 'supplier-debts',
    title: 'Supplier Ledger / سجل الموردين',
    description: 'Supplier debts and payments posted during the period, with receipt numbers and running direction.',
    icon: Truck,
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-debts',
    headline: (data) => ({ label: 'Closing owed / المستحق الختامي', value: data.suppliers.movement.closing, money: true }),
  },
  {
    id: 'supplier-receiving',
    title: 'Supplier Receiving / استلام الموردين',
    description: 'Receiving documents posted in the period, their line and quantity totals, and any linked supplier debt.',
    icon: ReceiptText,
    category: 'suppliers',
    kind: 'rows',
    slice: 'suppliers-receiving',
  },
  {
    id: 'sales',
    title: 'Sales Report / تقرير المبيعات',
    description: 'Every sales order in the period with payment and fulfillment status, total, paid, and remaining.',
    icon: ShoppingCart,
    category: 'sales',
    kind: 'rows',
    slice: 'sales-orders',
    headline: (data) => ({ label: 'Orders / الطلبات', value: String(data.sales.orderCount) }),
  },
  {
    id: 'unpaid-sales',
    title: 'Unpaid Sales / مبيعات غير مدفوعة',
    description: 'Sales orders that still carry a balance. This is a live backlog, not a record of the selected period.',
    icon: Users,
    category: 'sales',
    kind: 'rows',
    slice: 'sales-unpaid',
    operational: true,
    headline: (data) => ({ label: 'Unpaid / غير مدفوع', value: data.sales.unpaidAmount, money: true }),
  },
  {
    id: 'stock-movements',
    title: 'Stock Movements / حركات المخزون',
    description: 'Every stock movement in the period by type, with the balance before and after each change.',
    icon: Boxes,
    category: 'inventory',
    kind: 'rows',
    slice: 'inventory-movements',
  },
  {
    id: 'receiving-reconciliation',
    title: 'Receiving Reconciliation / مطابقة الاستلام',
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
