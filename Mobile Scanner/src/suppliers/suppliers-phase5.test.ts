import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiSession } from '../api/hc-client';
import { setSelectedBranch } from '../branches/branch-selection';
import { countUnlinkedBills, linkablePurchases, linkAfterPurchase, linkBill, listUnlinkedBills } from './bills-inbox';
import {
  buildConvertPayload,
  buildCreatePayload,
  buildDeliverPayload,
  createPrepaid,
  deliverPrepaid,
  listPrepaid,
  type PrepaidPurchase,
} from '../prepaid/prepaid';

const client = { baseUrl: 'http://shop-pc:3011', token: 'access' };
let fetchMock: ReturnType<typeof vi.fn>;
const ok = (data: unknown, status = 200) => ({ status, json: async () => ({ success: true, data }) });

beforeEach(() => {
  setSelectedBranch('branch-a');
  fetchMock = vi.fn().mockResolvedValue(ok({}));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  configureApiSession(null);
  setSelectedBranch(null);
  vi.unstubAllGlobals();
});

describe('bills inbox', () => {
  it('reads the cross-supplier inbox and badge count from the PC', async () => {
    fetchMock.mockResolvedValueOnce(ok([{ id: 'b1', supplierName: 'Fixture supplier' }])).mockResolvedValueOnce(ok({ count: 4 }));
    await listUnlinkedBills(client, 50);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://shop-pc:3011/api/v1/supplier-bills?linked=false&limit=50');
    expect(await countUnlinkedBills(client)).toBe(4);
    expect(fetchMock.mock.calls[1]![0]).toBe('http://shop-pc:3011/api/v1/supplier-bills/unlinked-count');
  });

  it("links in the bill's own branch, like the desktop", async () => {
    await linkBill(client, { id: 'b1', branchId: 'branch-b' }, 'recv-1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://shop-pc:3011/api/v1/supplier-bills/b1');
    expect(init.method).toBe('PATCH');
    expect(init.headers['X-Branch-Scope']).toBe('branch-b');
    expect(JSON.parse(init.body)).toEqual({ supplierReceivingId: 'recv-1' });
  });

  it('offers only active purchases that have a receiving document', () => {
    const purchase = (id: string, supplierReceivingId: string | null, status = 'ACTIVE') => ({
      id, supplierReceivingId, status, receiptNumber: null, transactionDate: '2026-11-12', amount: '1.00', description: 'x',
    });
    expect(
      linkablePurchases([purchase('a', 'r1'), purchase('b', null), purchase('c', 'r3', 'REMOVED')]).map((p) => p.id)
    ).toEqual(['a']);
  });

  it('links after "create purchase from bill" only when the purchase received stock', async () => {
    const withStock = await linkAfterPurchase(client, { id: 'b1', branchId: 'branch-a' }, { supplierReceivingId: 'r9' });
    expect(withStock.linked).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ supplierReceivingId: 'r9' });

    fetchMock.mockClear();
    const noStock = await linkAfterPurchase(client, { id: 'b1', branchId: 'branch-a' }, { supplierReceivingId: null });
    expect(noStock.linked).toBe(false);
    expect(noStock.message).toMatch(/stays in the bills inbox/);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce({ status: 400, json: async () => ({ success: false, error: { message: 'Wrong supplier' } }) });
    const failed = await linkAfterPurchase(client, { id: 'b1', branchId: 'branch-a' }, { supplierReceivingId: 'r9' });
    expect(failed).toMatchObject({ linked: false });
    expect(failed.message).toMatch(/purchase was saved.*Wrong supplier/);
  });
});

describe('prepaid purchases', () => {
  const pending = { status: 'PENDING' as const, isFullyPaid: false };

  it('builds the create payload the desktop sends and blocks overpayment', () => {
    expect(buildCreatePayload({ itemName: ' Fridge ', fullAmount: '1,200', paymentAmount: '200.5', notes: ' ' })).toEqual({
      itemName: 'Fridge', fullAmount: '1200.00', paymentAmount: '200.50', notes: null,
    });
    expect(() => buildCreatePayload({ itemName: 'x', fullAmount: '100', paymentAmount: '150', notes: '' })).toThrow(/exceed/);
    expect(() => buildCreatePayload({ itemName: ' ', fullAmount: '100', paymentAmount: '10', notes: '' })).toThrow(/item name/);
    expect(() => buildCreatePayload({ itemName: 'x', fullAmount: '100', paymentAmount: '0', notes: '' })).toThrow(/greater than zero/);
  });

  it('requires a remainder due date only when money is still owed', () => {
    expect(() => buildDeliverPayload(pending, { remainderDueDate: '', deliveryNotes: '' })).toThrow(/due date/);
    expect(buildDeliverPayload(pending, { remainderDueDate: '2026-12-01', deliveryNotes: ' van ' })).toEqual({
      remainderDueDate: '2026-12-01', deliveryNotes: 'van',
    });
    expect(buildDeliverPayload({ status: 'PENDING', isFullyPaid: true }, { remainderDueDate: '2026-12-01', deliveryNotes: '' })).toEqual({
      remainderDueDate: null, deliveryNotes: null,
    });
    expect(() => buildDeliverPayload({ status: 'DELIVERED', isFullyPaid: true }, { remainderDueDate: '', deliveryNotes: '' })).toThrow(/awaiting delivery/);
    expect(() => buildDeliverPayload(pending, { remainderDueDate: '2026-02-30', deliveryNotes: '' })).toThrow(/due date/);
  });

  it('converts the remainder to a debt or installments, never for a fully paid item', () => {
    expect(buildConvertPayload(pending, { mode: 'DEBT', date: '2026-12-01', installmentCount: '', frequency: 'MONTHLY' })).toEqual({
      mode: 'DEBT', dueDate: '2026-12-01',
    });
    expect(buildConvertPayload(pending, { mode: 'INSTALLMENT', date: '2026-12-01', installmentCount: '6', frequency: 'WEEKLY' })).toEqual({
      mode: 'INSTALLMENT', startDate: '2026-12-01', installmentCount: 6, frequency: 'WEEKLY',
    });
    expect(() => buildConvertPayload(pending, { mode: 'INSTALLMENT', date: '2026-12-01', installmentCount: '121', frequency: 'MONTHLY' })).toThrow(/1 to 120/);
    expect(() => buildConvertPayload({ status: 'PENDING', isFullyPaid: true }, { mode: 'DEBT', date: '2026-12-01', installmentCount: '', frequency: 'MONTHLY' })).toThrow(/fully paid/);
  });

  it('uses the desktop prepaid routes, with the item branch on actions', async () => {
    fetchMock.mockResolvedValue(ok({ items: [], summary: {}, pagination: { page: 1, totalPages: 1 } }));
    await listPrepaid(client, { status: 'PENDING', search: 'fridge', customerId: 'c1', page: 2 });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'http://shop-pc:3011/api/v1/prepaid-purchases?status=PENDING&search=fridge&customerId=c1&page=2&pageSize=25'
    );
    await createPrepaid(client, 'c1', { itemName: 'Fridge', fullAmount: '1200.00', paymentAmount: '200.00', notes: null });
    expect(fetchMock.mock.calls[1]![0]).toBe('http://shop-pc:3011/api/v1/customers/c1/prepaid-purchases');
    const item = { id: 'p1', branchId: 'branch-b' } as PrepaidPurchase;
    await deliverPrepaid(client, item, { remainderDueDate: null, deliveryNotes: null });
    const [url, init] = fetchMock.mock.calls[2]!;
    expect(url).toBe('http://shop-pc:3011/api/v1/prepaid-purchases/p1/deliver');
    expect(init.headers['X-Branch-Scope']).toBe('branch-b');
  });
});

describe('over-the-air update row', async () => {
  const { describeInstalledUpdate, updateCheckMessage } = await import('../updates/update-status');
  it('describes the installed version in plain words', () => {
    expect(describeInstalledUpdate({ version: '2.0.0', enabled: false, channel: null, updateId: null, isEmbeddedLaunch: true })).toBe(
      'Version 2.0.0 · updates are off in this build'
    );
    expect(describeInstalledUpdate({ version: '2.0.0', enabled: true, channel: 'preview', updateId: null, isEmbeddedLaunch: true })).toBe(
      'built-in version · preview · tap to check for an update'
    );
    expect(
      describeInstalledUpdate({ version: '2.0.0', enabled: true, channel: 'production', updateId: 'abcdef1234567890', isEmbeddedLaunch: false })
    ).toBe('update abcdef12 · production · tap to check for an update');
  });
  it('explains that updates need the internet and that drafts are kept', () => {
    expect(updateCheckMessage('error')).toMatch(/internet/);
    expect(updateCheckMessage('ready')).toMatch(/drafts and pending bills are kept/);
  });
});
