import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { customer, supplier } = vi.hoisted(() => ({
  customer: { findUnique: vi.fn() },
  supplier: { findUnique: vi.fn() },
}));
vi.mock('../lib/prisma', () => ({ prisma: { customer, supplier } }));
import { customerParentGuard, supplierParentGuard } from './branch-parent.middleware';

const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function run(guard: typeof customerParentGuard, path: string, method = 'GET', branchIds = [a]) {
  const next = vi.fn();
  await guard(
    { path, method, branchScope: { mode: 'all', branchIds } } as Request,
    {} as Response,
    next
  );
  return next;
}

describe('shared parent scope guard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it.each([
    ['customer', customerParentGuard, customer, 'Customer not found'],
    ['supplier', supplierParentGuard, supplier, 'Supplier not found'],
  ] as const)(
    'hides an out-of-scope %s before nested handlers run',
    async (_kind, guard, model, message) => {
      model.findUnique.mockResolvedValue({ branchId: b });
      const next = await run(guard, '/' + id + '/transactions');
      expect(next).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ statusCode: 404, message })
      );
      expect(model.findUnique).toHaveBeenCalledExactlyOnceWith({
        where: { id },
        select: { branchId: true },
      });
    }
  );
  it('passes accessible and missing parents to the existing downstream handler', async () => {
    customer.findUnique.mockResolvedValueOnce({ branchId: a }).mockResolvedValueOnce(null);
    expect(await run(customerParentGuard, '/' + id + '/debts')).toHaveBeenCalledExactlyOnceWith();
    expect(await run(customerParentGuard, '/' + id + '/debts')).toHaveBeenCalledExactlyOnceWith();
  });
  it.each(['/search', '/search-suggestions', '/', '/not-a-uuid/debts', '/%ZZ/debts'])(
    'leaves literal/invalid path %s untouched',
    async (path) => {
      expect(await run(customerParentGuard, path)).toHaveBeenCalledExactlyOnceWith();
      expect(customer.findUnique).not.toHaveBeenCalled();
    }
  );
  it('checks URL-encoded UUID segments rather than letting Express decode them after the guard', async () => {
    customer.findUnique.mockResolvedValue({ branchId: b });
    const encoded = id.replace('c', '%63');
    expect(await run(customerParentGuard, '/' + encoded + '/statement')).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 })
    );
    expect(customer.findUnique).toHaveBeenCalledWith({ where: { id }, select: { branchId: true } });
  });
  it('preserves the supplier purchase creation missing-parent message', async () => {
    supplier.findUnique.mockResolvedValue({ branchId: b });
    expect(await run(supplierParentGuard, '/' + id + '/purchases', 'POST')).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Supplier not found / المورد غير موجود',
        statusCode: 404,
      })
    );
  });
});

it('blocks nested writes in multi-branch all scope while allowing reads', async () => {
  customer.findUnique.mockResolvedValue({ branchId: a });
  expect(await run(customerParentGuard, '/' + id + '/debts', 'GET', [a, b])).toHaveBeenCalledExactlyOnceWith();
  expect(await run(customerParentGuard, '/' + id + '/debts', 'POST', [a, b])).toHaveBeenCalledWith(
    expect.objectContaining({ statusCode: 409, code: 'BRANCH_SELECTION_REQUIRED' })
  );
});
