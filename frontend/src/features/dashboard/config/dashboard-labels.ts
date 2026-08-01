export interface BilingualText { en: string; ar: string }

export const dashboardLabels = {
  pageTitle: { en: 'Dashboard', ar: 'لوحة التحكم' },
  pageSubtitle: { en: 'Business position, trends, and exceptions in one view.', ar: 'مركز موحّد لوضع العمل والاتجاهات والتنبيهات.' },
  quickActions: { en: 'Quick Actions', ar: 'إجراءات سريعة' },
  alerts: { en: 'Alerts', ar: 'التنبيهات' },
  customerAnalytics: { en: 'Customer Analytics', ar: 'تحليلات الزبائن' },
  supplierAnalytics: { en: 'Supplier Analytics', ar: 'تحليلات المورّدين' },
  serviceAnalytics: { en: 'Maintenance Analytics', ar: 'تحليلات الصيانة' },
  productAnalytics: { en: 'Product Analytics', ar: 'تحليلات المنتجات' },
  monthEnd: { en: 'End of Month Status', ar: 'حالة نهاية الشهر' },
  recentActivity: { en: 'Recent Activity', ar: 'النشاط الأخير' },
  systemModules: { en: 'System Modules', ar: 'وحدات النظام' },
  collectedToday: { en: 'Collected Today', ar: 'المبالغ المحصلة اليوم' },
  customersPaidToday: { en: 'Customers Paid Today', ar: 'الزبائن الذين دفعوا اليوم' },
  newDebtsToday: { en: 'New Debts Today', ar: 'ديون جديدة اليوم' },
  outstandingDebt: { en: 'Outstanding Debt', ar: 'الديون المتبقية' },
  owedToSuppliers: { en: 'Owed to Suppliers', ar: 'المستحق للمورّدين' },
  openServiceJobs: { en: 'Open Service Jobs', ar: 'طلبات الصيانة المفتوحة' },
  readyForPickup: { en: 'Ready for Pickup', ar: 'جاهز للاستلام' },
  activeProducts: { en: 'Active Products', ar: 'المنتجات النشطة' },
} as const satisfies Record<string, BilingualText>;

export type DashboardLabelKey = keyof typeof dashboardLabels;
