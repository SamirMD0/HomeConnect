import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { customerStatementsApi } from './customer-statements.api';

vi.mock('../../../services/api', () => ({ api: { get: vi.fn() } }));

describe('customerStatementsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the inclusive date range to the customer statement endpoint', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: { closingBalance: '75.00' } } });
    await expect(customerStatementsApi.get('customer-1', '2026-01-01', '2026-01-31')).resolves.toMatchObject({ closingBalance: '75.00' });
    expect(api.get).toHaveBeenCalledWith('/customers/customer-1/statement', { params: { from: '2026-01-01', to: '2026-01-31' } });
  });
});
