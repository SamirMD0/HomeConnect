import { beforeEach, describe, expect, it, vi } from 'vitest';
import { monthlyReportsApi } from './monthly-reports.api';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  api: apiMock,
}));

describe('monthlyReportsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches monthly debt snapshot with strict YYYY-MM params', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { summary: { month: '2026-07', totalOutstanding: '300.00' }, rows: [] },
      },
    });

    const result = await monthlyReportsApi.getMonthlyDebtReport({
      month: '2026-07',
      search: 'Ali',
      overdueOnly: true,
      page: 2,
    });

    expect(apiMock.get).toHaveBeenCalledWith('/reports/monthly-debts', {
      params: expect.objectContaining({
        month: '2026-07',
        mode: 'SNAPSHOT',
        search: 'Ali',
        overdueOnly: true,
        page: 2,
        sortBy: 'OUTSTANDING',
      }),
    });
    expect(result.summary.totalOutstanding).toBe('300.00');
  });

  it('exports CSV through the backend export endpoint', async () => {
    const blob = new Blob(['csv']);
    apiMock.get.mockResolvedValue({ data: blob });

    const result = await monthlyReportsApi.exportMonthlyDebtCsv({ month: '2026-07' });

    expect(apiMock.get).toHaveBeenCalledWith('/reports/monthly-debts/export.csv', {
      params: expect.objectContaining({ month: '2026-07', limit: 10000 }),
      responseType: 'blob',
    });
    expect(result).toBe(blob);
  });

  it('fetches monthly financial activity separately from snapshot data', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { summary: { month: '2026-07', netFinancialChange: '900.00' }, items: [] },
      },
    });

    const result = await monthlyReportsApi.getMonthlyFinancialActivity({ month: '2026-07' });

    expect(apiMock.get).toHaveBeenCalledWith('/reports/monthly-financial-activity', {
      params: expect.objectContaining({ month: '2026-07', page: 1, limit: 50 }),
    });
    expect(result.summary.netFinancialChange).toBe('900.00');
  });
});
