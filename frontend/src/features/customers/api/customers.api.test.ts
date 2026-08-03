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
});
