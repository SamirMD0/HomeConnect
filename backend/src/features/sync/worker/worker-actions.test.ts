import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, type ClaimedAction, type ActionDependencies } from './worker-actions';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const targetId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const deps = { user: vi.fn(), previous: vi.fn(), remember: vi.fn(), fetch: vi.fn() };
const request = vi.fn();
let action: ClaimedAction;
const response = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
const run = () => applyAction(action, { request }, Date.now() + 10000, deps as ActionDependencies);
describe('apply phone actions through the PC API', () => {
  it('requests reports through the real user route and retains the PC refusal for staff',async()=>{
    action.type='report.request';action.payload={reportId:'sales-summary',filters:{period:'lastMonth'}};
    deps.user.mockResolvedValue({id:userId,role:'EMPLOYEE',isActive:true});deps.fetch.mockResolvedValue(response(403,{error:{code:'FORBIDDEN',message:'Access denied. Required role: ADMIN'}}));await run();
    expect(deps.fetch.mock.calls[0][1].method).toBeUndefined();expect(jwt.verify(deps.fetch.mock.calls[0][1].headers.Authorization.slice(7),process.env.JWT_SECRET!)).toMatchObject({role:'EMPLOYEE'});
    expect(request).toHaveBeenLastCalledWith(expect.any(String),{status:'refused',result:{code:'FORBIDDEN',message:'Access denied. Required role: ADMIN'}});
  });
  it('returns PC report data and refuses oversized on-demand reports',async()=>{
    action.type='report.request';action.payload={reportId:'sales-summary',filters:{period:'lastMonth'}};
    deps.fetch.mockResolvedValue(response(200,{data:{rows:[{amount:'123.45'}]}}));await run();expect(request).toHaveBeenLastCalledWith(expect.any(String),expect.objectContaining({status:'applied',result:expect.objectContaining({report:{rows:[{amount:'123.45'}]}})}));
    deps.fetch.mockResolvedValue(response(200,{data:{rows:[{value:'x'.repeat(1536*1024)}]}}));await run();expect(request).toHaveBeenLastCalledWith(expect.any(String),{status:'refused',result:{code:'REPORT_TOO_LARGE',message:'Open this report on the shop Wi-Fi.'}});
  });
  it('includes the PC payment receipt with only the business fields used for sharing',async()=>{
    action.type='customer_payment.create';action.payload={targetType:'DEBT',targetId,amount:'20.00'};
    deps.fetch.mockImplementation(async(url:string)=>response(200,{data:url.endsWith('/receipt')?{id:targetId,totalAmount:'20.00'}:url.endsWith('/business-settings')?{shopName:'Shop',address:'Address',phone:'1',email:'a@b',taxNumber:'VAT',logoDataUrl:'secret-large-image',privateField:'secret'}:{payments:[{id:targetId,idempotencyKey:actionId}]}}));
    await run();expect(request).toHaveBeenLastCalledWith(expect.any(String),expect.objectContaining({status:'applied',result:expect.objectContaining({receipt:expect.objectContaining({payment:{id:targetId,totalAmount:'20.00'},business:{shopName:'Shop',address:'Address',phone:'1',email:'a@b',taxNumber:'VAT'}})})}));
    expect(JSON.stringify(request.mock.calls)).not.toContain('secret-large-image');
  });
  beforeEach(() => {
    vi.resetAllMocks();
    action = { id: actionId, userId, branchId: targetId, type: 'supplier_payment.create', attempts: 1, hasBlob: false,
      payload: { supplierId: targetId, type: 'SUPPLIER_PAYMENT', amount: '20.00', currency: 'USD', transactionDate: '2026-11-16', paymentMethod: 'CASH_USD', description: 'Supplier payment' } };
    deps.user.mockResolvedValue({ id: userId, role: 'ADMIN', isActive: true, deletedAt: null });
    deps.previous.mockResolvedValue(null);
    deps.fetch.mockImplementation(async () => response(201, { data: { id: targetId, amount: '20.00', currency: 'USD' } }));
    deps.remember.mockImplementation(async (_action, outcome) => outcome);
  });
  it('uses the exact user token payload for two minutes, branch scope and action idempotency key', async () => {
    await run();
    const [url, options] = deps.fetch.mock.calls[0];
    expect(url).toMatch(new RegExp(`/api/v1/suppliers/${targetId}/transactions$`));
    const token = jwt.verify(options.headers.Authorization.slice(7), process.env.JWT_SECRET!) as jwt.JwtPayload;
    expect(token).toMatchObject({ userId, role: 'ADMIN' });
    expect(token.exp! - token.iat!).toBe(120);
    expect(options.headers['X-Branch-Scope']).toBe(targetId);
    expect(JSON.parse(options.body).idempotencyKey).toBe(actionId);
    expect(deps.remember).toHaveBeenCalledWith(action, { status: 'applied', result: { id: targetId, amount: '20.00', currency: 'USD' } });
    expect(request).toHaveBeenCalledWith(`/outbox/${actionId}/result`, expect.objectContaining({ status: 'applied' }));
  });
  it('replays a stored result without loading the user or calling the API', async () => {
    deps.previous.mockResolvedValue({ status: 'applied', result: { id: targetId } });
    await run();
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.user).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(`/outbox/${actionId}/result`, { status: 'applied', result: { id: targetId } });
  });
  it('refuses unknown types and inactive users', async () => {
    action.type = 'customer.delete';
    await run();
    expect(request).toHaveBeenLastCalledWith(expect.any(String), { status: 'refused', result: { reason: 'UNSUPPORTED_ACTION' } });
    action.type = 'sales_order.create';
    deps.user.mockResolvedValue({ isActive: false });
    await run();
    expect(request).toHaveBeenLastCalledWith(expect.any(String), { status: 'refused', result: { reason: 'USER_INACTIVE' } });
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it('persists and reports PC 4xx messages', async () => {
    deps.fetch.mockResolvedValue(response(403, { error: { code: 'FORBIDDEN', message: 'Only an administrator can record supplier payments.' } }));
    await run();
    expect(request).toHaveBeenCalledWith(expect.any(String), { status: 'refused', result: { code: 'FORBIDDEN', message: 'Only an administrator can record supplier payments.' } });
  });
  it.each([false, true])('leaves transient PC failures retryable (network=%s)', async network => {
    if (network) deps.fetch.mockRejectedValue(new Error('network'));
    else deps.fetch.mockResolvedValue(response(500, {}));
    await run();
    expect(request).not.toHaveBeenCalled();
    expect(deps.remember).not.toHaveBeenCalled();
    action.attempts = 5;
    await run();
    expect(request).toHaveBeenCalledWith(expect.any(String), { status: 'failed', result: { reason: 'PC_ERROR' } });
  });
  it('keeps an applied journal entry replayable when reporting to the relay fails', async () => {
    request.mockRejectedValueOnce(new Error('relay offline'));
    await expect(run()).rejects.toThrow('relay offline');
    expect(deps.remember).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
  });
  it('maps debt and installment targets outside the unchanged payment body', async () => {
    action.type = 'customer_payment.create';
    for (const targetType of ['DEBT', 'INSTALLMENT_PLAN']) {
      action.payload = { targetType, targetId, amount: '10.00', paymentDate: '2026-11-16', paymentMethod: 'CASH' };
      await run();
      const [url, options] = deps.fetch.mock.calls.filter(([,options]) => options.method === 'POST').at(-1)!;
      expect(url).toContain(targetType === 'DEBT' ? '/debts/' : '/installment-plans/');
      expect(JSON.parse(options.body)).toEqual({ amount: '10.00', paymentDate: '2026-11-16', paymentMethod: 'CASH', idempotencyKey: actionId });
    }
  });
  it('returns the created payment ID rather than the debt or plan ID', async () => {
    action.type = 'customer_payment.create';
    action.payload = { targetType: 'DEBT', targetId, amount: '10.00', paymentDate: '2026-11-16', paymentMethod: 'CASH' };
    deps.fetch.mockImplementation(async () => response(201, { data: { id: targetId, payments: [
      { id: 'older-payment', idempotencyKey: 'unrelated' }, { id: 'created-payment', idempotencyKey: actionId },
    ] } }));
    await run();
    expect(deps.remember).toHaveBeenCalledWith(action, { status: 'applied', result: {
      receipt: expect.any(Object), id: 'created-payment', payments: [{ id: 'created-payment', idempotencyKey: actionId }],
    } });
  });
  it('uploads the photo with receipt and bill-group idempotency headers', async () => {
    action.type = 'supplier_bill.upload';
    action.payload = { supplierId: targetId, billGroupId: userId, note: 'Invoice' };
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    request.mockResolvedValueOnce({ mime: 'image/png', bytes });
    await run();
    expect(request).toHaveBeenCalledWith(`/outbox/${actionId}/blob`, undefined, true);
    expect(deps.fetch.mock.calls[0][1]).toMatchObject({ body: bytes, headers: {
      'Content-Type': 'image/png', 'X-Receipt-Id': actionId, 'X-Bill-Group': userId,
    } });
  });
  describe('phase 3 cloud actions', () => {
    const productId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const sent = () => {
      const [url, options] = deps.fetch.mock.calls[0];
      return { url: String(url), body: JSON.parse(options.body), token: jwt.verify(options.headers.Authorization.slice(7), process.env.JWT_SECRET!) as jwt.JwtPayload };
    };
    it('posts a stock movement tagged with the action id, never a password, as a PIN-confirmed user', async () => {
      action.type = 'stock_movement.create';
      action.payload = { productId, movementType: 'STOCK_COUNT', quantity: 7, reason: 'Shelf count', accountPassword: 'leaked' };
      deps.fetch.mockResolvedValue(response(201, { data: { changed: true, product: { id: productId, stockQuantity: 7 }, movement: { id: targetId } } }));
      await run();
      const { url, body, token } = sent();
      expect(url).toMatch(new RegExp(`/api/v1/products/${productId}/stock-movements$`));
      expect(body).toEqual({ movementType: 'STOCK_COUNT', quantity: 7, reason: 'Shelf count', referenceType: 'SYNC_ACTION', referenceId: actionId });
      expect(token).toMatchObject({ userId, pinConfirmed: true });
      expect(deps.remember).toHaveBeenCalledWith(action, { status: 'applied', result: { id: targetId, productId, stockQuantity: 7 } });
    });
    it('routes receiving, purchases and prepaid items with the action as idempotency key', async () => {
      const cases = [
        ['stock_receiving.create', { supplierId: targetId, lines: [] }, '/inventory/receivings'],
        ['supplier_purchase.create', { supplierId: targetId, lines: [] }, `/suppliers/${targetId}/purchases`],
        ['prepaid.create', { customerId: targetId, itemName: 'Fridge', paymentAmount: '10.00', fullAmount: '50.00' }, `/customers/${targetId}/prepaid-purchases`],
      ] as const;
      for (const [type, payload, path] of cases) {
        deps.fetch.mockClear();
        action.type = type;
        action.payload = payload;
        await run();
        const { url, body } = sent();
        expect(url.endsWith('/api/v1' + path)).toBe(true);
        expect(body.idempotencyKey).toBe(actionId);
        if (type !== 'stock_receiving.create') expect(body.supplierId ?? body.customerId).toBeUndefined();
      }
    });
    const billId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    it('links, deletes and retakes bill pages with the right PC method', async () => {
      action.type = 'supplier_bill.link';
      action.payload = { billId, transactionId: targetId };
      await run();
      let [url, options] = deps.fetch.mock.calls[0];
      expect([String(url).endsWith(`/supplier-bills/${billId}`), options.method, JSON.parse(options.body)]).toEqual([true, 'PATCH', { supplierTransactionId: targetId }]);

      deps.fetch.mockClear();
      action.type = 'supplier_bill.delete';
      action.payload = { billId, wholeBill: true };
      await run();
      [url, options] = deps.fetch.mock.calls[0];
      expect([String(url).endsWith(`/supplier-bills/${billId}?bill=true`), options.method, options.body]).toEqual([true, 'DELETE', undefined]);

      deps.fetch.mockClear();
      request.mockImplementation(async (path: string) => path.endsWith('/blob') ? { mime: 'image/jpeg', bytes: new ArrayBuffer(8) } : {});
      action.type = 'supplier_bill.replace';
      action.payload = { billId };
      await run();
      [url, options] = deps.fetch.mock.calls[0];
      expect(String(url).endsWith(`/supplier-bills/${billId}/replace`)).toBe(true);
      expect(options.headers['Content-Type']).toBe('image/jpeg');
      expect(options.headers['X-Receipt-Id']).toBeUndefined();
    });
    it('records a purchase from a bill, then attaches that bill to it', async () => {
      action.type = 'supplier_purchase.create';
      action.payload = { supplierId: targetId, billId, lines: [] };
      deps.fetch.mockResolvedValueOnce(response(201, { data: { id: productId, supplierId: targetId } }))
        .mockResolvedValueOnce(response(200, { data: {} }));
      await run();
      expect(JSON.parse(deps.fetch.mock.calls[0][1].body).billId).toBeUndefined();
      const [url, options] = deps.fetch.mock.calls[1];
      expect([String(url).endsWith(`/supplier-bills/${billId}`), options.method, JSON.parse(options.body)]).toEqual([true, 'PATCH', { supplierTransactionId: productId }]);
      expect(deps.remember).toHaveBeenCalledWith(action, { status: 'applied', result: expect.objectContaining({ id: productId, billLinked: true }) });
    });
    it('keeps the purchase applied when attaching the bill fails', async () => {
      action.type = 'supplier_purchase.create';
      action.payload = { supplierId: targetId, billId, lines: [] };
      deps.fetch.mockResolvedValueOnce(response(201, { data: { id: productId } }))
        .mockResolvedValueOnce(response(409, { error: { code: 'CONFLICT' } }));
      await run();
      expect(deps.remember).toHaveBeenCalledWith(action, { status: 'applied', result: expect.objectContaining({ billLinked: false }) });
    });
    it('refuses a stock movement without a valid product id', async () => {
      action.type = 'stock_movement.create';
      action.payload = { productId: 'nope', movementType: 'MANUAL_ADD', quantity: 1, reason: 'x' };
      await run();
      expect(deps.fetch).not.toHaveBeenCalled();
      expect(request).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ status: 'refused' }));
    });
  });
});
