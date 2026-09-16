import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { buildSupplierPayables } from '../../suppliers/payables/supplier-payables';
import { DashboardAlertsService } from './dashboard-alerts.service';

const { payables } = vi.hoisted(() => ({ payables: { get: vi.fn() } }));
vi.mock('../../suppliers/payables/supplier-payables.service', () => ({ SupplierPayablesService: payables }));
vi.mock('../customer/customer-analytics.service', () => ({ CustomerAnalyticsService: { get: vi.fn().mockResolvedValue({ totals: { overdueCustomers: 0 }, ageDistribution: [], topDebtors: [] }) } }));
vi.mock('../supplier/supplier-analytics.service', () => ({ SupplierAnalyticsService: { get: vi.fn().mockResolvedValue({ totals: { suppliersWithBalance: 0, owed: '0.00' }, topBalances: [] }) } }));
vi.mock('../service/service-analytics.service', () => ({ ServiceAnalyticsService: { get: vi.fn().mockResolvedValue({ totals: { aging: 0 }, agingJobs: [] }) } }));
vi.mock('../product/product-analytics.repository', () => ({ ProductAnalyticsRepository: { load: vi.fn().mockResolvedValue({ products: [] }) } }));
vi.mock('../service/service-analytics.repository', () => ({ ServiceAnalyticsRepository: { load: vi.fn().mockResolvedValue([]) } }));
const range = { from: '2026-09-01', to: '2026-09-14', previousFrom: '2026-08-01', previousTo: '2026-08-14', preset: 'month' as const, granularity: 'day' as const };

describe('supplier payable dashboard alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    payables.get.mockResolvedValue(buildSupplierPayables(['2026-09-13', '2026-09-14', '2026-09-21', '2026-09-22', null].map((dueDate, index) => ({
      id: `debt-${index}`, supplier: { id: 'supplier', name: 'Supplier A', phone: '123' },
      direction: 'INCREASE_OWED', type: 'SUPPLIER_DEBT', amount: new Decimal(10), baseAmount: new Decimal(10), currency: 'USD',
      transactionDate: '2026-09-01', createdAt: '2026-09-01T00:00:00.000Z', description: 'Invoice', receiptNumber: null, dueDate,
    })), '2026-09-14'));
  });
  it('shows overdue, today through day seven, and the oldest overdue, excluding future/unscheduled', async () => {
    const result = await DashboardAlertsService.get(range, { includeArchived: false, includeAdminData: true, businessDate: '2026-09-14' });
    const overdue = result.alerts.find((a) => a.key === 'overdue-supplier-payables');
    const soon = result.alerts.find((a) => a.key === 'supplier-payables-due-soon');
    expect(overdue).toMatchObject({ count: 1, amount: '10.00', route: '/reports/supplier-aging' });
    expect(overdue?.offenders[0].label).toContain('Oldest overdue');
    expect(overdue?.offenders[0].label).toContain('2026-09-13');
    expect(soon).toMatchObject({ count: 2, amount: '20.00' });
    expect(soon?.label.en).toContain('7 days');
    expect(soon?.offenders.map((o) => o.id)).toEqual(['debt-1', 'debt-2']);
  });
  it('does not load or expose administrative payable details to staff', async () => {
    const result = await DashboardAlertsService.get(range, { includeArchived: false, includeAdminData: false });
    expect(payables.get).not.toHaveBeenCalled();
    expect(result.alerts.some((a) => a.key.includes('supplier-payables'))).toBe(false);
  });
});
