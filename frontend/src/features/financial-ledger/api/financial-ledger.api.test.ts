import { beforeEach, describe, expect, it, vi } from 'vitest';
import { financialLedgerApi } from './financial-ledger.api';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  api: apiMock,
}));

describe('financialLedgerApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the unified financial-ledger endpoint with filters', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { summary: { totalOutstanding: '850.00' }, items: [] },
      },
    });

    const result = await financialLedgerApi.getFinancialLedger({
      type: 'DEBT',
      search: 'Ali',
      page: 2,
      includeCancelled: true,
    });

    expect(apiMock.get).toHaveBeenCalledWith('/financial-ledger', {
      params: expect.objectContaining({
        type: 'DEBT',
        search: 'Ali',
        page: 2,
        includeCancelled: true,
        includeCompleted: false,
      }),
    });
    expect(apiMock.get.mock.calls[0][0]).not.toContain('/transactions');
    expect(result.summary.totalOutstanding).toBe('850.00');
  });
});
