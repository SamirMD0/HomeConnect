import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ supplierReceivingReceipt: { findMany: vi.fn() } }));
vi.mock('../../../lib/prisma', () => ({ prisma: db }));
import { getUnlinkedBill, listUnlinkedBills } from './receipts.service';

const scope = { mode: 'single' as const, branchIds: ['branch-a'] };
describe('single supplier bill metadata for sync', () => {
  beforeEach(() => vi.resetAllMocks());

  it('uses the inbox page grouping and supplier-name shape for a stable bill ID', async () => {
    const page = { id: 'replacement-page', billGroupId: 'first-page', pageNumber: 1, supplier: { id: 'supplier', name: 'Supplier' }, filename: 'photo.jpg' };
    db.supplierReceivingReceipt.findMany.mockResolvedValue([
      { ...page, id: 'second-page', pageNumber: 2 }, page,
    ]);
    const bill = await getUnlinkedBill('first-page', scope);
    expect(bill).toEqual((await listUnlinkedBills(scope))[0]);
    expect(bill).toMatchObject({ id: 'replacement-page', billGroupId: 'first-page', pageCount: 2, supplierName: 'Supplier' });
    expect(db.supplierReceivingReceipt.findMany).toHaveBeenCalledWith({
      where: {
        supplierReceivingId: null, supplierTransactionId: null, deletedAt: null, replacedAt: null,
        branchId: { in: ['branch-a'] }, OR: [{ billGroupId: 'first-page' }, { id: 'first-page', billGroupId: null }],
      },
      orderBy: { capturedAt: 'desc' }, include: { supplier: { select: { id: true, name: true } } },
    });
  });

  it('returns null for deleted, replaced, linked or out-of-scope bills', async () => {
    db.supplierReceivingReceipt.findMany.mockResolvedValue([]);
    expect(await getUnlinkedBill('missing', scope)).toBeNull();
  });
});
