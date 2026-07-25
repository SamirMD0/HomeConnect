import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customerFinancialApi } from './customer-financial.api';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  api: apiMock,
}));

describe('customerFinancialApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the unified financial-summary endpoint with focused options', async () => {
    apiMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { summary: { totalOutstanding: '850.00' } },
      },
    });

    const result = await customerFinancialApi.getCustomerFinancialSummary('customer-1', {
      includeCancelled: true,
      paymentLimit: 5,
    });

    expect(apiMock.get).toHaveBeenCalledWith('/customers/customer-1/financial-summary', {
      params: {
        includeCancelled: true,
        paymentLimit: 5,
      },
    });
    expect(result).toEqual({ summary: { totalOutstanding: '850.00' } });
  });

  it('propagates API errors', async () => {
    const error = new Error('network failed');
    apiMock.get.mockRejectedValue(error);

    await expect(customerFinancialApi.getCustomerFinancialSummary('customer-1')).rejects.toThrow(
      error
    );
  });
});
