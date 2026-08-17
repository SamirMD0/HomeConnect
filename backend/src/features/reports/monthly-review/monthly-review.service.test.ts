import { describe, expect, it, vi } from 'vitest';

const { services } = vi.hoisted(() => ({
  services: {
    monthEnd: vi.fn(),
    metrics: vi.fn(),
    customer: vi.fn(),
    supplier: vi.fn(),
    sales: vi.fn(),
    inventory: vi.fn(),
    risk: vi.fn(),
  },
}));

vi.mock('../../dashboard/month-end/month-end.service', () => ({ MonthEndService: { get: services.monthEnd } }));
vi.mock('../metrics/reports-metrics.service', () => ({ ReportsMetricsService: { get: services.metrics } }));
vi.mock('../../dashboard/customer/customer-analytics.service', () => ({ CustomerAnalyticsService: { get: services.customer } }));
vi.mock('../../dashboard/supplier/supplier-analytics.service', () => ({ SupplierAnalyticsService: { get: services.supplier } }));
vi.mock('../../dashboard/sales/sales-analytics.service', () => ({ SalesAnalyticsService: { get: services.sales } }));
vi.mock('../../inventory/inventory.service', () => ({ InventoryService: { getInventorySummary: services.inventory } }));
vi.mock('../../dashboard/alerts/dashboard-alerts.service', () => ({ DashboardAlertsService: { get: services.risk } }));

import { MonthlyReviewService } from './monthly-review.service';

describe('MonthlyReviewService', () => {
  it('composes authoritative period metrics into separated report domains', async () => {
    arrangeServices();

    const report = await MonthlyReviewService.get(
      { period: 'custom', from: '2026-07-10', to: '2026-07-20' },
      { businessDate: '2026-08-17', generatedAt: new Date('2026-08-17T08:00:00.000Z') }
    );

    expect(report.meta).toEqual({
      from: '2026-07-10', to: '2026-07-20', previousFrom: '2026-06-29',
      previousTo: '2026-07-09', preset: 'custom', generatedAt: '2026-08-17T08:00:00.000Z', currency: 'USD',
    });
    expect(Object.keys(report.data)).toEqual(['sales', 'customers', 'suppliers', 'inventory', 'risk']);
    expect(report.data.sales).toMatchObject({
      orderCount: 2, totalAmount: '300.00', paidAmount: '200.00',
      unpaidAmount: '100.00', averageOrderValue: '150.00',
    });
    expect(report.data.customers.movement.closing).toBe('70.00');
    expect(report.data.suppliers.movement.closing).toBe('40.00');
    expect(report.data.inventory.operationalSnapshot.generatedAt).toBe(report.meta.generatedAt);
    expect(report.data.risk.operationalSnapshotAt).toBe(report.meta.generatedAt);
  });

  it('passes the exact cutoff to point-in-time movement and CP-R3 metrics', async () => {
    arrangeServices();

    await MonthlyReviewService.get(
      { period: 'thisMonth' },
      { businessDate: '2026-08-17', generatedAt: new Date('2026-08-17T08:00:00.000Z') }
    );

    expect(services.monthEnd).toHaveBeenCalledWith({ from: '2026-08-01', to: '2026-08-17' });
    expect(services.metrics).toHaveBeenCalledWith(expect.objectContaining({
      from: '2026-08-01', to: '2026-08-17', preset: 'thisMonth',
    }));
    expect(services.sales).toHaveBeenCalledWith(expect.objectContaining({
      from: '2026-08-01', to: '2026-08-17',
    }), '2026-08-17');
  });

  it('exports the composed review through the shared BOM CSV builder', async () => {
    arrangeServices();
    const result = await MonthlyReviewService.exportCsv(
      { period: 'lastMonth' },
      { businessDate: '2026-08-17', generatedAt: new Date('2026-08-17T08:00:00.000Z') }
    );
    expect(result.filename).toBe('monthly-review-2026-07-01-to-2026-07-31.csv');
    expect(result.csv.startsWith('\uFEFF')).toBe(true);
    expect(result.csv).toContain('Sales,Total sales,300.00');
    expect(result.csv).toContain('Customers,Closing receivable,70.00');
  });
});

function arrangeServices() {
  vi.clearAllMocks();
  services.monthEnd.mockResolvedValue({
    meta: { from: '2026-07-10', to: '2026-07-20' },
    customers: movement('70.00'),
    suppliers: { ...movement('40.00'), withBalance: 1 },
    disclosure: { en: 'Disclosure', ar: 'إفصاح' },
    service: {},
  });
  services.metrics.mockResolvedValue({
    sales: {
      orderCount: 2, totalAmount: '300.00', paidAmount: '200.00',
      unpaidAmount: '100.00', averageOrderValue: '150.00',
    },
    customers: { newCustomers: 1, activeCustomers: 3, paidCount: 2, didNotPayCount: 1, didNotPay: [] },
  });
  services.customer.mockResolvedValue({ ageDistribution: [], topDebtors: [] });
  services.supplier.mockResolvedValue({ totals: { owed: '40.00', suppliersWithBalance: 1 }, topBalances: [] });
  services.sales.mockResolvedValue({
    salesByDay: [], paymentStatusDistribution: [], fulfillmentStatusDistribution: [], topProducts: [],
  });
  services.inventory.mockResolvedValue({ trackedProducts: 4, lowStockProducts: 1, outOfStockProducts: 1, totalUnits: 20, movementsToday: 2, ordersAwaitingStockDeduction: 0, recentMovements: [] });
  services.risk.mockResolvedValue({ alerts: [], total: 0 });
}

function movement(closing: string) {
  return {
    opening: '0.00', newAmount: closing, collected: '0.00', adjustments: '0.00',
    closing, reconciled: true, withDebt: 1, fullyPaid: 0, overdue: 0,
  };
}
