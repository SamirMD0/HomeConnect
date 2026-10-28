import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SalesOrdersRepository } from '../sales/sales-orders/sales-orders.repository';
import { SupplierReceivingsRepository } from '../inventory/receiving/supplier-receivings.repository';

// No user/grant delegate: both writers must consume the already resolved scope.
describe.each(['sale', 'receiving'] as const)('explicit creation scope: %s', (kind) => {
  function fixture(parentBranch = 'a', parent = false) {
    const create = vi.fn().mockImplementation(async ({ data }) => data);
    const tx = {
      salesOrder: { create },
      supplierReceiving: { create },
      customer: { findUnique: vi.fn().mockResolvedValue({ branchId: parentBranch }) },
      supplier: { findUnique: vi.fn().mockResolvedValue({ branchId: parentBranch }) },
    } as unknown as Prisma.TransactionClient;
    const run = (branchIds: string[]) =>
      kind === 'sale'
        ? SalesOrdersRepository.create(
            { customerId: parent ? 'customer' : null } as Prisma.SalesOrderUncheckedCreateInput,
            tx,
            { mode: 'all', branchIds }
          )
        : SupplierReceivingsRepository.create(
            {
              supplierId: parent ? 'supplier' : null,
            } as Prisma.SupplierReceivingUncheckedCreateInput,
            tx,
            { mode: 'all', branchIds }
          );
    return { create, run };
  }
  it('uses the sole selected branch for a parent-less create', async () => {
    const { create, run } = fixture();
    expect(await run(['a'])).toMatchObject({ branchId: 'a' });
    expect(create).toHaveBeenCalledOnce();
  });
  it.each([[], ['a', 'b']])(
    'rejects ambiguous or empty scope before inserting: %j',
    async (...branchIds) => {
      const { create, run } = fixture();
      await expect(run(branchIds)).rejects.toMatchObject({
        statusCode: 409,
        code: branchIds.length ? 'BRANCH_SELECTION_REQUIRED' : 'NO_BRANCH_AVAILABLE',
      });
      expect(create).not.toHaveBeenCalled();
    }
  );
  it('derives ownership from an in-scope parent', async () => {
    expect(await fixture('a', true).run(['a'])).toMatchObject({ branchId: 'a' });
  });
  it('hides an out-of-scope parent before inserting', async () => {
    const { create, run } = fixture('b', true);
    await expect(run(['a'])).rejects.toMatchObject({ statusCode: 404 });
    expect(create).not.toHaveBeenCalled();
  });
});
