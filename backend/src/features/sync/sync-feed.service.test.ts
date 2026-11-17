import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(), $executeRaw: vi.fn(),
    syncChange: { findMany: vi.fn(), findFirst: vi.fn() },
    branch: { findFirst: vi.fn() }, user: { findUnique: vi.fn() },
  },
  inventory: vi.fn(), financialSummary: vi.fn(), product: vi.fn(), customer: vi.fn(), order: vi.fn(), supplier: vi.fn(),
  bill: vi.fn(), category: vi.fn(), guard: vi.fn(), document: vi.fn(),
}));
vi.mock('../../lib/prisma', () => ({ prisma: mocks.db }));
vi.mock('../service/products/products.service', () => ({ ProductsService: { getCatalogRecord: mocks.product } }));
vi.mock('../../services/customers.service', () => ({ CustomersService: { getCustomerWithFinancial: mocks.customer } }));
vi.mock('../sales/sales-orders/sales-orders.service', () => ({ SalesOrdersService: { get: mocks.order } }));
vi.mock('../suppliers/suppliers/suppliers.service', () => ({ SuppliersService: { get: mocks.supplier } }));
vi.mock('../suppliers/receipts/receipts.service', () => ({ getUnlinkedBill: mocks.bill }));
vi.mock('../categories/categories.service', () => ({ CategoriesService: { get: mocks.category } }));
vi.mock('../branches/parent-branch', () => ({ assertRecordInScope: mocks.guard }));
vi.mock('../documents/document-branch', () => ({ documentBranch: mocks.document }));

vi.mock('../inventory/inventory.service', () => ({ InventoryService: { getProductInventory: mocks.inventory } }));
vi.mock('../financial/customer-summary/customer-financial-summary.service', () => ({ CustomerFinancialSummaryService: { getCustomerFinancialSummary: mocks.financialSummary } }));

import { readChanges } from './sync-feed.service';
import { NotFoundError } from '../../lib/errors';

const scope = { mode: 'single' as const, branchIds: ['branch-a'] };
const change = (seq: number, entity = 'product', entityId = 'product-1', branchId: string | null = null, op = 'upsert') => ({
  seq: BigInt(seq), entity, entityId, branchId, op, changedAt: new Date(),
});

describe('sync feed', () => {
  it('carries PC-owned customer financial detail and inventory detail unchanged', async () => {
    mocks.db.syncChange.findMany.mockResolvedValue([change(1, 'customer', 'c', 'branch-a'), change(2, 'product', 'p')]);
    mocks.customer.mockResolvedValue({ id: 'c', branchId: 'branch-a', financial: { outstanding: '9007199254740993.25' } });
    const financialSummary = { summary: { totalOutstanding: '9007199254740993.25' }, debts: [{ remainingBalance: '17.03' }] };
    const inventory = { product: { stockQuantity: 7 }, recentMovements: [], onboardingStatus: 'ONBOARDED' };
    mocks.financialSummary.mockResolvedValue(financialSummary);
    mocks.inventory.mockResolvedValue(inventory);
    const feed = await readChanges(0, 500, scope);
    expect(feed.records[0]).toMatchObject({ data: { financialSummary } });
    expect(mocks.financialSummary).toHaveBeenCalledWith('c', {
      includeCancelled: false, includePayments: false, debtLimit: 100, planLimit: 100, paymentLimit: 20,
    });
    expect(feed.records[1]).toMatchObject({ data: { inventory } });
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.db.$transaction.mockImplementation(async operation => operation(mocks.db));
    mocks.db.syncChange.findMany.mockResolvedValue([]);
    mocks.db.syncChange.findFirst.mockResolvedValue(null);
    mocks.product.mockResolvedValue({ id: 'product-1', pricing: { cashPrice: '123.45' }, image: { byteSize: 500 } });
  });

  it('collapses to the last operation for each entity and ID in cursor order', async () => {
    mocks.db.syncChange.findMany.mockResolvedValue([
      change(1), change(2, 'category', 'category-1'), change(3),
      change(4, 'product', 'removed', null, 'delete'),
    ]);
    mocks.category.mockResolvedValue({ id: 'category-1' });
    const result = await readChanges(0, 500, scope);
    expect(mocks.product).toHaveBeenCalledTimes(1);
    expect(result.records).toEqual([
      { minRole: null, entity: 'category', id: 'category-1', branchId: null, op: 'upsert', data: { id: 'category-1' } },
      { minRole: null, entity: 'product', id: 'product-1', branchId: null, op: 'upsert', data: { id: 'product-1', pricing: { cashPrice: '123.45' }, image: { byteSize: 500 } } },
      { minRole: null, entity: 'product', id: 'removed', branchId: null, op: 'delete' },
    ]);
    expect(result.nextSeq).toBe('4');
  });

  it('returns tombstones for hard deletes, soft deletes, linked bills and missing records', async () => {
    mocks.db.syncChange.findMany.mockResolvedValue([
      change(1, 'customer', 'soft', 'branch-a'), change(2, 'supplier_bill', 'linked', 'branch-a'),
      change(3, 'product', 'missing'), change(4, 'user', 'hard', null, 'delete'),
    ]);
    mocks.customer.mockRejectedValue(new NotFoundError());
    mocks.bill.mockResolvedValue(null);
    mocks.product.mockRejectedValue(new NotFoundError());
    expect((await readChanges(0n, 500, scope)).records).toEqual([
      { minRole: null, entity: 'customer', id: 'soft', branchId: 'branch-a', op: 'delete' },
      { minRole: null, entity: 'supplier_bill', id: 'linked', branchId: 'branch-a', op: 'delete' },
      { minRole: null, entity: 'product', id: 'missing', branchId: null, op: 'delete' },
      { minRole: 'ADMIN', entity: 'user', id: 'hard', branchId: null, op: 'delete' },
    ]);
  });

  it('filters other branches while advancing across every raw row', async () => {
    mocks.db.syncChange.findMany.mockResolvedValue([
      change(10, 'customer', 'other', 'branch-b'),
      change(11, 'supplier', 'deleted-other', 'branch-b', 'delete'),
      change(12, 'sales_order', 'order-other', 'branch-b'),
      change(13, 'branch', 'branch-b', 'branch-b'),
    ]);
    mocks.customer.mockRejectedValue(new NotFoundError());
    mocks.guard.mockRejectedValue(new NotFoundError());
    mocks.db.branch.findFirst.mockResolvedValue(null);
    expect(await readChanges(9n, 4, scope)).toEqual({ records: [], nextSeq: '13', hasMore: false });
    expect(mocks.order).not.toHaveBeenCalled();
    expect(mocks.guard).toHaveBeenCalledWith('salesOrder', 'order-other', scope);
  });

  it('uses current visibility after branch transfers and removes records from the former branch', async () => {
    mocks.db.syncChange.findMany.mockResolvedValue([
      change(1, 'customer', 'moved', 'branch-a'), change(2, 'customer', 'moved', 'branch-b'),
    ]);
    mocks.customer.mockResolvedValue({ id: 'moved', branchId: 'branch-b', financial: {} });
    const newScope = { mode: 'single' as const, branchIds: ['branch-b'] };
    expect((await readChanges(0, 500, newScope)).records[0].op).toBe('upsert');
    expect(mocks.customer).toHaveBeenCalledWith('moved', newScope);
    mocks.customer.mockRejectedValue(new NotFoundError());
    expect((await readChanges(0, 500, scope)).records).toEqual([{ minRole: null, entity: 'customer', id: 'moved', branchId: 'branch-b', op: 'delete' }]);
  });

  it('takes branch metadata from the current entity rather than an old invalidation', async () => {
    mocks.db.syncChange.findMany.mockResolvedValue([change(1, 'customer', 'moved', 'branch-a')]);
    mocks.customer.mockResolvedValue({ id: 'moved', branchId: 'branch-b', financial: {} });
    const records = (await readChanges(0, 500, { mode: 'all', branchIds: ['branch-a', 'branch-b'] })).records;
    expect(records[0]).toMatchObject({ branchId: 'branch-b', op: 'upsert' });
  });

  it('includes newly created branches in worker batches without widening ordinary callers', async () => {
    mocks.db.syncChange.findMany.mockResolvedValue([change(1, 'customer', 'new', 'branch-b')]);
    mocks.customer.mockImplementation(async (_id, requested) => {
      if (!requested.branchIds.includes('branch-b')) throw new NotFoundError();
      return { id: 'new', branchId: 'branch-b' };
    });
    expect((await readChanges(0, 500, scope)).records).toEqual([]);
    expect((await readChanges(0, 500, scope, { system: true })).records).toEqual([
      { minRole: null, entity: 'customer', id: 'new', branchId: 'branch-b', op: 'upsert', data: { id: 'new', branchId: 'branch-b' } },
    ]);
  });

  it('passes through the PC financial, order, supplier and bill service results', async () => {
    const cases = [
      ['customer', mocks.customer, { financial: { outstanding: '432.10' } }],
      ['sales_order', mocks.order, { totalAmount: '95.55', items: [] }],
      ['supplier', mocks.supplier, { balance: '23.45' }],
      ['supplier_bill', mocks.bill, { pageCount: 2, pages: [{ filename: 'photo.jpg' }] }],
    ] as const;
    mocks.document.mockResolvedValue({ branch: { name: 'Main' }, showBranchLine: true });
    for (const [entity, mock, data] of cases) {
      mocks.db.syncChange.findMany.mockResolvedValue([change(1, entity, 'id', 'branch-a')]);
      mock.mockResolvedValue(data);
      const expected = entity === 'sales_order' ? { ...data, branch: { name: 'Main' }, showBranchLine: true } : data;
      expect((await readChanges(0, 500, scope)).records).toEqual([{ minRole: null, entity, id: 'id', branchId: 'branch-a', op: 'upsert', data: expected }]);
    }
  });

  it('keeps bigint cursors exact, bounds raw reads and checks for another page', async () => {
    const after = 9007199254740993n;
    mocks.db.syncChange.findMany.mockResolvedValue([{ ...change(1), seq: after + 1n }]);
    mocks.db.syncChange.findFirst.mockResolvedValue({ seq: after + 2n });
    const result = await readChanges(after, 1, scope);
    expect(result).toMatchObject({ nextSeq: '9007199254740994', hasMore: true });
    expect(mocks.db.syncChange.findMany).toHaveBeenCalledWith({ where: { seq: { gt: after } }, orderBy: { seq: 'asc' }, take: 1 });
    expect(mocks.db.syncChange.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { seq: { gt: after + 1n } } }));
    mocks.db.syncChange.findMany.mockResolvedValue([]);
    expect(await readChanges(after, 1, scope)).toEqual({ records: [], nextSeq: after.toString(), hasMore: false });
  });

  it('selects only the five public user fields', async () => {
    mocks.db.syncChange.findMany.mockResolvedValue([change(1, 'user', 'user-1')]);
    const user = { id: 'user-1', username: 'admin', fullName: 'Admin', role: 'ADMIN', isActive: true };
    mocks.db.user.findUnique.mockImplementation(async ({ select }) => {
      const stored = { ...user, password: 'secret', refreshToken: 'token', failedLoginAttempts: 3 };
      return Object.fromEntries(Object.keys(select).map(key => [key, stored[key as keyof typeof stored]]));
    });
    expect((await readChanges(0, 500, scope)).records[0]).toEqual({ minRole: 'ADMIN', entity: 'user', id: 'user-1', branchId: null, op: 'upsert', data: user });
    expect(mocks.db.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1', deletedAt: null },
      select: { id: true, username: true, fullName: true, role: true, isActive: true },
    });
  });

  it('propagates unexpected failures so a caller cannot advance past failed records', async () => {
    mocks.db.syncChange.findMany.mockResolvedValue([change(1)]);
    mocks.product.mockRejectedValue(new Error('Database unavailable'));
    await expect(readChanges(0, 500, scope)).rejects.toThrow('Database unavailable');
  });

  it.each([
    { code: '55P03' },
    { code: 'P2010', meta: { code: '55P03', message: 'canceling statement due to lock timeout' } },
  ])('returns busy with the exact cursor when the advisory lock times out (%j)', async error => {
    mocks.db.$executeRaw.mockResolvedValueOnce(0).mockRejectedValueOnce(error);
    expect(await readChanges(9007199254740993n, 500, scope)).toEqual({
      records: [], nextSeq: '9007199254740993', hasMore: false, busy: true,
    });
    expect(mocks.db.$executeRaw.mock.calls.map(([sql]) => sql.join(''))).toEqual([
      "SET LOCAL lock_timeout = '2s'", 'SELECT pg_advisory_xact_lock(74103, 1)',
    ]);
    expect(mocks.db.syncChange.findMany).not.toHaveBeenCalled();
    expect(mocks.product).not.toHaveBeenCalled();
  });

  it('propagates other database failures from the log transaction', async () => {
    mocks.db.$executeRaw.mockRejectedValue({ code: 'P2010', meta: { code: '42P01' } });
    await expect(readChanges(0, 500, scope)).rejects.toEqual({ code: 'P2010', meta: { code: '42P01' } });
  });

  it('keeps order line amounts and names independent of current product stock and price', async () => {
    mocks.db.syncChange.findMany.mockResolvedValue([change(1, 'sales_order', 'order-1', 'branch-a')]);
    mocks.document.mockResolvedValue({});
    const product = { id: 'product-1', name: 'Fan', model: 'F1', sku: 'FAN', barcode: null, isActive: true };
    mocks.order.mockResolvedValue({
      id: 'order-1', totalAmount: '20.00',
      items: [{ id: 'line-1', productId: product.id, unitPrice: '20.00', productNameSnapshot: 'Original fan',
        product: { ...product, trackStock: true, stockQuantity: 5, lowStockThreshold: 2, costPrice: '9.00' },
        inventory: { stockQuantity: 5 }, stockFulfillments: [] }],
    });
    const first = await readChanges(0, 500, scope);
    expect(first.records[0]).toMatchObject({ data: { items: [{ product, unitPrice: '20.00', stockFulfillments: [] }] } });
    expect(first.records[0]).not.toHaveProperty('data.items.0.inventory');
    expect(first.records[0]).not.toHaveProperty('data.items.0.product.costPrice');
    mocks.order.mockResolvedValue({
      id: 'order-1', totalAmount: '20.00',
      items: [{ id: 'line-1', productId: product.id, unitPrice: '20.00', productNameSnapshot: 'Original fan',
        product: { ...product, trackStock: false, stockQuantity: 0, lowStockThreshold: 1, costPrice: '15.00' },
        inventory: { stockQuantity: 0 }, stockFulfillments: [] }],
    });
    expect(await readChanges(0, 500, scope)).toEqual(first);
  });

  it.each([[-1, 1], [Number.MAX_SAFE_INTEGER + 1, 1], [0, 0], [0, 501], [0, 1.5]])(
    'rejects invalid cursor %s or limit %s', async (after, limit) => {
      await expect(readChanges(after, limit, scope)).rejects.toThrow();
      expect(mocks.db.syncChange.findMany).not.toHaveBeenCalled();
    }
  );
});
