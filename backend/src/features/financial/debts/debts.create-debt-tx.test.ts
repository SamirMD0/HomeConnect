import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../../lib/errors';

const { repositoryMock } = vi.hoisted(() => ({
  repositoryMock: {
    findActiveCustomerById: vi.fn(),
    createDebt: vi.fn(),
  },
}));

vi.mock('./debts.repository', () => ({ DebtsRepository: repositoryMock }));

import { DebtsService } from './debts.service';

describe('DebtsService caller transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.findActiveCustomerById.mockResolvedValue(null);
  });

  it('uses the caller transaction for the active-customer check', async () => {
    const tx = { marker: 'caller-transaction' } as never;
    const customerId = '22222222-2222-4222-8222-222222222222';

    await expect(DebtsService.createDebt(customerId, {
      amount: '80.00',
      description: 'Sales order SO-2026-0001',
      dueDate: '2026-08-10',
      notes: null,
    }, {
      userId: '11111111-1111-4111-8111-111111111111',
      role: 'ADMIN',
    }, tx)).rejects.toThrow(NotFoundError);

    expect(repositoryMock.findActiveCustomerById).toHaveBeenCalledWith(customerId, tx);
    expect(repositoryMock.createDebt).not.toHaveBeenCalled();
  });
});
