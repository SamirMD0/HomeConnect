import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customersApi } from './customers.api';

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../../services/api', () => ({ api: apiMock }));

describe('customers API search', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards a multi-token Arabic query unchanged to the backend', async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [], meta: { pagination: {} } },
    });

    await customersApi.getCustomers({ search: 'محمد عمار' });

    expect(apiMock.get).toHaveBeenCalledWith('/customers', {
      params: { search: 'محمد عمار' },
    });
  });

  it('asks for financial figures alongside the page so rows need no follow-up request', async () => {
    apiMock.get.mockResolvedValue({
      data: { success: true, data: [], meta: { pagination: {} } },
    });

    await customersApi.getCustomers({ page: 1, limit: 10, include: 'financial' });

    expect(apiMock.get).toHaveBeenCalledWith('/customers', {
      params: { page: 1, limit: 10, include: 'financial' },
    });
  });
});
