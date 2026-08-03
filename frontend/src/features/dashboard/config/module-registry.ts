import {
  ArrowLeftRight, BookOpen, CalendarClock, ClipboardList, FileBarChart,
  FilePlus2, FileText, HandCoins, Landmark, Package, PackagePlus, ShoppingCart,
  Tags, TrendingUp, Truck, UserPlus, Users, Warehouse, Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { BilingualText } from './dashboard-labels';

export type ModuleStatus = 'LIVE' | 'NEXT' | 'PLANNED';
export interface ErpModule { key: string; label: BilingualText; icon: LucideIcon; status: ModuleStatus; route?: string; accent: string; countKey?: string }

export const erpModules: ErpModule[] = [
  module('customers', 'Customers', 'الزبائن', Users, 'LIVE', '/customers', '#2a78d6', 'customers'),
  module('debts', 'Debts', 'الديون', FileText, 'LIVE', '/receivables', '#eb6834', 'debts'),
  module('payments', 'Payments', 'الدفعات', HandCoins, 'LIVE', '/ledger?view=payments', '#2a78d6'),
  module('plans', 'Installment Plans', 'خطط التقسيط', CalendarClock, 'LIVE', '/ledger?view=plans', '#eb6834'),
  module('ledger', 'Ledger', 'دفتر الحسابات', BookOpen, 'LIVE', '/ledger', '#2a78d6'),
  module('suppliers', 'Suppliers', 'المورّدون', Truck, 'LIVE', '/suppliers', '#1baf7a', 'suppliers'),
  module('supplierLedger', 'Supplier Ledger', 'دفتر المورّدين', ClipboardList, 'LIVE', '/supplier-ledger', '#eda100'),
  module('products', 'Products', 'المنتجات', Package, 'LIVE', '/products', '#1baf7a', 'products'),
  module('pricing', 'Pricing Presets', 'إعدادات التسعير', Tags, 'LIVE', '/pricing-presets', '#eda100'),
  module('service', 'Service Jobs', 'طلبات الصيانة', Wrench, 'LIVE', '/service', '#e87ba4', 'service'),
  module('reports', 'Reports', 'التقارير', FileBarChart, 'LIVE', '/reports', '#2a78d6'),
  module('inventory', 'Inventory', 'المخزون', Warehouse, 'NEXT', undefined, '#898781'),
  module('orders', 'Sales Orders', 'طلبات البيع', ShoppingCart, 'LIVE', '/sales-orders', '#2a78d6', 'salesOrders'),
  module('sales', 'Sales Management', 'إدارة المبيعات', TrendingUp, 'PLANNED', undefined, '#898781'),
  module('finance', 'Finance Tracking', 'التتبع المالي', Landmark, 'PLANNED', undefined, '#898781'),
];

export interface QuickActionDefinition { key: string; label: BilingualText; icon: LucideIcon; route: string; adminOnly?: boolean }
export const dashboardQuickActions: QuickActionDefinition[] = [
  action('addCustomer', 'Add Customer', 'إضافة زبون', UserPlus, '/customers?action=add'),
  action('addDebt', 'Add Debt', 'إضافة دين', FilePlus2, '/customers?action=add-debt', true),
  action('recordPayment', 'Record Payment', 'تسجيل دفعة', HandCoins, '/customers?action=record-payment', true),
  action('addSupplier', 'Add Supplier', 'إضافة مورّد', Truck, '/suppliers?action=add', true),
  action('supplierTransaction', 'Supplier Transaction', 'حركة مورّد', ArrowLeftRight, '/suppliers?action=add-transaction', true),
  action('addProduct', 'Add Product', 'إضافة منتج', PackagePlus, '/products?action=add', true),
  action('addService', 'Add Service Job', 'طلب صيانة جديد', Wrench, '/service?action=add', true),
  action('addSale', 'New Sales Order', 'طلب بيع جديد', ShoppingCart, '/sales-orders?action=add'),
  action('ledger', 'View Ledger', 'عرض دفتر الحسابات', BookOpen, '/ledger'),
  action('reports', 'View Reports', 'عرض التقارير', FileBarChart, '/reports'),
];

export const dashboardKpiIcons: Record<string, LucideIcon> = {
  collectedToday: HandCoins, customersPaidToday: Users, newDebtsToday: FilePlus2,
  outstandingDebt: FileText, owedToSuppliers: Truck, openServiceJobs: Wrench,
  readyForPickup: Package, activeProducts: Package,
};

function module(key: string, en: string, ar: string, icon: LucideIcon, status: ModuleStatus, route: string | undefined, accent: string, countKey?: string): ErpModule { return { key, label: { en, ar }, icon, status, route, accent, countKey }; }
function action(key: string, en: string, ar: string, icon: LucideIcon, route: string, adminOnly = false): QuickActionDefinition { return { key, label: { en, ar }, icon, route, adminOnly }; }
