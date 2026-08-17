import { beforeEach, describe, expect, it, vi } from 'vitest';
import { monthlyReviewApi } from './monthly-review.api';

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn() } }));
vi.mock('../../../services/api', () => ({ api: apiMock }));

describe('monthlyReviewApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requests a preset review and returns its typed envelope', async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, meta: { preset: 'lastMonth' }, data: { sales: { totalAmount: '321.00' } } },
    });

    const result = await monthlyReviewApi.get({ period: 'lastMonth' });

    expect(apiMock.get).toHaveBeenCalledWith('/reports/monthly-review', {
      params: { period: 'lastMonth' },
    });
    expect(result.data.sales.totalAmount).toBe('321.00');
  });

  it('sends both boundaries for a custom review', async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, meta: {}, data: {} } });

    await monthlyReviewApi.get({ period: 'custom', from: '2026-07-05', to: '2026-07-18' });

    expect(apiMock.get).toHaveBeenCalledWith('/reports/monthly-review', {
      params: { period: 'custom', from: '2026-07-05', to: '2026-07-18' },
    });
  });

  it('exports monthly review CSV for the selected period', async () => {
    const blob = new Blob(['csv']);
    apiMock.get.mockResolvedValue({ data: blob });
    const result = await monthlyReviewApi.exportCsv({ period: 'lastMonth' });
    expect(apiMock.get).toHaveBeenCalledWith('/reports/monthly-review/export.csv', {
      params: { period: 'lastMonth' }, responseType: 'blob',
    });
    expect(result).toBe(blob);
  });
});
