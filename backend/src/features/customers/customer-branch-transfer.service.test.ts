import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transaction, verifyPassword } = vi.hoisted(() => ({
  transaction: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('../../lib/admin-verification', () => ({ verifyAdminPassword: verifyPassword }));
vi.mock('../financial/infrastructure/transaction', () => ({ runFinancialTransaction: transaction }));

import { CustomerBranchTransferService } from './customer-branch-transfer.service';
import { customerBranchTransferSchema } from '../../validators/customers.validator';

describe('customer branch transfer without password confirmation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a destination without an account password', () => {
    const input = { toBranchId: '22222222-2222-4222-8222-222222222222' };
    expect(customerBranchTransferSchema.parse(input)).toEqual(input);
  });

  it('starts the transfer for an admin without checking a password', async () => {
    transaction.mockResolvedValue({ toBranchId: 'branch-b' });
    await expect(CustomerBranchTransferService.transfer({
      customerId: 'customer-a',
      toBranchId: 'branch-b',
      actor: { userId: 'admin-a', role: 'ADMIN' },
    })).resolves.toEqual({ toBranchId: 'branch-b' });
    expect(transaction).toHaveBeenCalledOnce();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('still rejects employees before starting a transfer', async () => {
    await expect(CustomerBranchTransferService.transfer({
      customerId: 'customer-a',
      toBranchId: 'branch-b',
      actor: { userId: 'employee-a', role: 'EMPLOYEE' },
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(transaction).not.toHaveBeenCalled();
  });
});
