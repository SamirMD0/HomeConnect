import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardApi } from './dashboard.api';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  api: apiMock,
}));

describe('dashboardApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the authoritative financial summary endpoint', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          businessDate: '2026-07-27',
          monthStart: '2026-07-01',
          counts: { totalCustomers: 2, customersWithOutstanding: 1 },
          money: {
            totalOutstanding: '500.00',
            paymentsToday: '50.00',
            paymentsThisMonth: '250.00',
            obligationsCreatedToday: '100.00',
            obligationsCreatedThisMonth: '900.00',
            netChangeToday: '50.00',
            netChangeThisMonth: '650.00',
          },
          upcomingDue: [],
          overdueCustomers: [],
          recentPayments: [],
        },
      },
    });

    const result = await dashboardApi.getFinancialSummary();

    expect(apiMock.get).toHaveBeenCalledWith('/dashboard/financial-summary');
    expect(result.money.totalOutstanding).toBe('500.00');
  });
});
