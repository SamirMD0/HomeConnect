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
      const [url, options] = deps.fetch.mock.calls.at(-1)!;
      expect(url).toContain(targetType === 'DEBT' ? '/debts/' : '/installment-plans/');
      expect(JSON.parse(options.body)).toEqual({ amount: '10.00', paymentDate: '2026-11-16', paymentMethod: 'CASH', idempotencyKey: actionId });
    }
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
});
