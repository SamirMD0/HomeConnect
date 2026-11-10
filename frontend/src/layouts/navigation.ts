import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  BookOpen,
  Wallet,
  Wrench,
  Package,
  Truck,
  Coins,
  Calculator,
  ScanLine,
  ShoppingCart,
  Warehouse,
  LayoutTemplate,
  Receipt,
  type LucideIcon,
} from 'lucide-react';
import type { BilingualText } from '../components/ui/BilingualLabel';

export type NavigationRole = 'ADMIN' | 'EMPLOYEE';

export interface NavigationItem {
  key: string;
  label: BilingualText;
  path: string;
  icon: LucideIcon;
  /** When set, item only shows for these roles. Omitted = visible to all. */
  requiresRole?: NavigationRole[];
}

export interface NavigationSection {
  id: string;
  /** Small uppercase label above the group. Hidden in collapsed rail. */
  heading: BilingualText;
  items: NavigationItem[];
}

/**
 * Single source of truth for the primary sidebar. Sections are visual grouping
 * only — routing and role checks are still resolved at render time so the
 * layout has no way to accidentally expose a hidden route.
 */
export const NAVIGATION: readonly NavigationSection[] = [
  {
    id: 'main',
    heading: { en: 'Main', ar: 'الرئيسية' },
    items: [
      { key: 'dashboard', label: { en: 'Dashboard', ar: 'لوحة القيادة' }, path: '/', icon: LayoutDashboard },
    ],
  },
  {
    id: 'sales',
    heading: { en: 'Sales', ar: 'المبيعات' },
    items: [
      { key: 'sales-orders', label: { en: 'Sales Orders', ar: 'طلبات البيع' }, path: '/sales-orders', icon: ShoppingCart },
      { key: 'scanner', label: { en: 'Barcode Scanner', ar: 'الماسح' }, path: '/scanner', icon: ScanLine },
    ],
  },
  {
    // Accounts receivable: everything the customers owe us, in ERP terms.
    id: 'customers',
    heading: { en: 'Customers', ar: 'الزبائن' },
    items: [
      { key: 'customers', label: { en: 'Customers', ar: 'الزبائن' }, path: '/customers', icon: Users },
      { key: 'ledger', label: { en: 'Transactions', ar: 'الحركات' }, path: '/ledger', icon: BookOpen },
      { key: 'receivables', label: { en: 'Receivables', ar: 'الذمم' }, path: '/receivables', icon: Wallet },
      { key: 'prepaid', label: { en: 'Deposits', ar: 'العربون' }, path: '/prepaid', icon: Coins },
    ],
  },
  {
    // Accounts payable: what we owe our suppliers.
    id: 'suppliers',
    heading: { en: 'Suppliers', ar: 'المورّدون' },
    items: [
      { key: 'suppliers', label: { en: 'Suppliers', ar: 'المورّدون' }, path: '/suppliers', icon: Truck },
      { key: 'supplier-ledger', label: { en: 'Bills & Payments', ar: 'الفواتير' }, path: '/supplier-ledger', icon: Receipt },
    ],
  },
  {
    id: 'inventory',
    heading: { en: 'Inventory', ar: 'المخزون' },
    items: [
      { key: 'products', label: { en: 'Products', ar: 'المنتجات' }, path: '/products', icon: Package },
      { key: 'inventory', label: { en: 'Stock Levels', ar: 'كميات المخزون' }, path: '/inventory', icon: Warehouse },
      { key: 'pricing-presets', label: { en: 'Price Rules', ar: 'قواعد التسعير' }, path: '/pricing-presets', icon: Calculator },
    ],
  },
  {
    id: 'service',
    heading: { en: 'After-Sales', ar: 'خدمة ما بعد البيع' },
    items: [
      { key: 'service', label: { en: 'Repairs & Warranty', ar: 'الصيانة والكفالة' }, path: '/service', icon: Wrench },
    ],
  },
  {
    id: 'reports',
    heading: { en: 'Reports', ar: 'التقارير' },
    items: [
      { key: 'reports', label: { en: 'Reports', ar: 'التقارير' }, path: '/reports', icon: FileText },
    ],
  },
  {
    id: 'system',
    heading: { en: 'System', ar: 'النظام' },
    items: [
      { key: 'pricing-cards', label: { en: 'Price Cards', ar: 'بطاقات الأسعار' }, path: '/pricing-cards', icon: LayoutTemplate, requiresRole: ['ADMIN'] },
      { key: 'settings', label: { en: 'Settings', ar: 'الإعدادات' }, path: '/settings', icon: Settings, requiresRole: ['ADMIN'] },
    ],
  },
] as const;

export function isItemVisible(item: NavigationItem, role: NavigationRole | undefined): boolean {
  if (!item.requiresRole) return true;
  if (!role) return false;
  return item.requiresRole.includes(role);
}

export function isPathActive(itemPath: string, currentPath: string): boolean {
  if (itemPath === '/') return currentPath === '/';
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export function findActiveItem(currentPath: string, role: NavigationRole | undefined): NavigationItem | undefined {
  const visible = NAVIGATION.flatMap((section) => section.items.filter((item) => isItemVisible(item, role)));
  // Prefer the deepest-matching path so /products/123 wins over /
  return visible
    .filter((item) => isPathActive(item.path, currentPath))
    .sort((a, b) => b.path.length - a.path.length)[0];
}
