import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { branches } = vi.hoisted(() => ({ branches: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { branch: { findMany: branches } } }));
import { withBranchBreakdown, withEnvelopeBranchBreakdown } from './branch-breakdown';

describe('branch aggregate breakdown', () => {
  beforeEach(() => branches.mockReset());
  it('retains the full-scope calculation and repeats it once per branch with additive money/count metadata', async () => {
    branches.mockResolvedValue([
      { id: 'a', code: 'A', name: 'Alpha' },
      { id: 'b', code: 'B', name: 'Beta' },
    ]);
    const calculate = vi.fn(async (scope: { branchIds: string[] }) => ({
      amount: scope.branchIds.length === 2 ? '0.30' : scope.branchIds[0] === 'a' ? '0.10' : '0.20',
      count: scope.branchIds.length,
    }));
    const result = await withBranchBreakdown({ mode: 'all', branchIds: ['a', 'b'] }, calculate);
    expect(result.amount).toBe('0.30');
    expect(result.count).toBe(2);
    expect(result.branchBreakdown).toEqual([
      { branchId: 'a', branchCode: 'A', branchName: 'Alpha', amount: '0.10', count: 1 },
      { branchId: 'b', branchCode: 'B', branchName: 'Beta', amount: '0.20', count: 1 },
    ]);
    expect(
      result.branchBreakdown!.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)).toFixed(2)
    ).toBe(result.amount);
    expect(calculate).toHaveBeenCalledTimes(3);
    expect(calculate).toHaveBeenNthCalledWith(1, { mode: 'all', branchIds: ['a', 'b'] });
  });
  it.each([[], ['a']])(
    'omits breakdown consistently for zero/one branch: %j',
    async (...branchIds) => {
      expect(
        await withBranchBreakdown({ mode: 'all', branchIds }, async () => ({ amount: '0.00' }))
      ).toEqual({ amount: '0.00' });
      expect(branches).not.toHaveBeenCalled();
    }
  );
  it('preserves report metadata and places breakdown beside the data fields', async () => {
    branches.mockResolvedValue([
      { id: 'a', code: 'A', name: 'Alpha' },
      { id: 'b', code: 'B', name: 'Beta' },
    ]);
    const result = await withEnvelopeBranchBreakdown(
      { mode: 'all', branchIds: ['a', 'b'] },
      async (scope) => ({ meta: { currency: 'USD' }, data: { count: scope.branchIds.length } })
    );
    expect(result.meta).toEqual({ currency: 'USD' });
    expect(result.data.count).toBe(2);
    expect(result.data.branchBreakdown).toHaveLength(2);
    expect(result).not.toHaveProperty('branchBreakdown');
  });
});
