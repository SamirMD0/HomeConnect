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
      { key: 'scanner', label: { en: 'Scanner Hub', ar: 'مركز المسح' }, path: '/scanner', icon: ScanLine },
    ],
  },
  {
    id: 'finance',
    heading: { en: 'Finance', ar: 'المالية' },
    items: [
      { key: 'ledger', label: { en: 'Ledger', ar: 'دفتر الحسابات' }, path: '/ledger', icon: BookOpen },
      { key: 'receivables', label: { en: 'Receivables', ar: 'الذمم' }, path: '/receivables', icon: Wallet },
      { key: 'prepaid', label: { en: 'Prepaid', ar: 'المدفوع مسبقاً' }, path: '/prepaid', icon: Coins },
    ],
  },
  {
    id: 'contacts',
    heading: { en: 'Contacts', ar: 'جهات الاتصال' },
    items: [
      { key: 'customers', label: { en: 'Customers', ar: 'الزبائن' }, path: '/customers', icon: Users },
      { key: 'suppliers', label: { en: 'Suppliers', ar: 'المورّدون' }, path: '/suppliers', icon: Truck },
      { key: 'supplier-ledger', label: { en: 'Supplier Ledger', ar: 'حسابات المورّدين' }, path: '/supplier-ledger', icon: Receipt },
    ],
  },
  {
    id: 'inventory',
    heading: { en: 'Inventory', ar: 'المخزون' },
    items: [
      { key: 'products', label: { en: 'Products', ar: 'المنتجات' }, path: '/products', icon: Package },
      { key: 'inventory', label: { en: 'Inventory', ar: 'المخزون' }, path: '/inventory', icon: Warehouse },
      { key: 'pricing-presets', label: { en: 'Pricing Presets', ar: 'صيغ التسعير' }, path: '/pricing-presets', icon: Calculator },
    ],
  },
  {
    id: 'service',
    heading: { en: 'Service', ar: 'الخدمة' },
    items: [
      { key: 'service', label: { en: 'Service', ar: 'الصيانة' }, path: '/service', icon: Wrench },
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
      { key: 'pricing-cards', label: { en: 'Pricing Cards', ar: 'بطاقات الأسعار' }, path: '/pricing-cards', icon: LayoutTemplate, requiresRole: ['ADMIN'] },
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
