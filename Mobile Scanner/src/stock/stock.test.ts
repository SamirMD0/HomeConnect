import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiSession, HcApiError } from '../api/hc-client';
import { setSelectedBranch } from '../branches/branch-selection';
import { createReceiving, postMovement } from './stock-api';
import {
  addCountScan,
  addReceiveScan,
  buildMovementPayload,
  buildReceivingPayload,
  countPayload,
  countSummary,
  englishMessage,
  initialCount,
  initialReceive,
  isAccountPasswordMessage,
  isStaleStockMessage,
  linesToSubmit,
  markLine,
  movementTypesFor,
  rebaseCountLine,
  resolveStale,
  setCounted,
  setReceiveQuantity,
} from './stock-logic';

const drill = { id: 'p1', name: 'Fixture drill', sku: 'QA-1', stockQuantity: 12, trackStock: true };
const saw = { id: 'p2', name: 'Fixture saw', sku: 'QA-2', stockQuantity: 3, trackStock: true };

describe('movement rules mirror the desktop', () => {
  it('lets employees add or return stock only; admins also remove, count and write off', () => {
    expect(movementTypesFor('EMPLOYEE')).toEqual(['MANUAL_ADD', 'RETURN_TO_STOCK']);
    expect(movementTypesFor('ADMIN')).toEqual([
      'MANUAL_ADD',
      'RETURN_TO_STOCK',
      'MANUAL_REMOVE',
      'STOCK_COUNT',
      'DAMAGE_LOSS',
    ]);
    expect(movementTypesFor(undefined)).toEqual(['MANUAL_ADD', 'RETURN_TO_STOCK']);
  });

  it('always sends expectedBefore and only sends a password for guarded types', () => {
    const add = buildMovementPayload({
      type: 'MANUAL_ADD', quantity: '5', expectedBefore: 12, reason: ' Delivery ', note: '', password: 'secret',
    });
    expect(add).toEqual({ movementType: 'MANUAL_ADD', quantity: 5, expectedBefore: 12, reason: 'Delivery', note: null });
    const remove = buildMovementPayload({
      type: 'MANUAL_REMOVE', quantity: '2', expectedBefore: 12, reason: 'Broken', note: 'shelf 3', password: 'secret',
    });
    expect(remove).toMatchObject({ expectedBefore: 12, accountPassword: 'secret', note: 'shelf 3' });
  });

  it('rejects bad input before it reaches the PC', () => {
    const base = { expectedBefore: 3, reason: 'x', note: '', password: 'p' };
    expect(() => buildMovementPayload({ ...base, type: 'MANUAL_ADD', quantity: '0' })).toThrow(/greater than zero/);
    expect(() => buildMovementPayload({ ...base, type: 'MANUAL_ADD', quantity: '1.5' })).toThrow(/whole number/);
    expect(() => buildMovementPayload({ ...base, type: 'MANUAL_ADD', quantity: '100001' })).toThrow(/100,000/);
    expect(() => buildMovementPayload({ ...base, type: 'MANUAL_REMOVE', quantity: '4' })).toThrow(/only 3 in stock/);
    expect(() => buildMovementPayload({ ...base, type: 'MANUAL_REMOVE', quantity: '1', password: '' })).toThrow(/password/);
    expect(() => buildMovementPayload({ ...base, type: 'STOCK_COUNT', quantity: '3' })).toThrow(/matches/);
    expect(() => buildMovementPayload({ ...base, type: 'MANUAL_ADD', quantity: '1', reason: '  ' })).toThrow(/Reason/);
    expect(buildMovementPayload({ ...base, type: 'STOCK_COUNT', quantity: '0' }).quantity).toBe(0);
  });

  it('reads the English half of bilingual server messages and recognises stale stock', () => {
    const stale = 'Stock changed from expected 12 to 9. Refresh and retry / تغيّر المخزون';
    expect(englishMessage(stale)).toBe('Stock changed from expected 12 to 9. Refresh and retry');
    expect(isStaleStockMessage(stale)).toBe(true);
    expect(isAccountPasswordMessage('Account password is incorrect')).toBe(true);
    expect(isAccountPasswordMessage('Session expired. Please sign in again.')).toBe(false);
  });
});

describe('stock count', () => {
  it('adds a product on first scan, increments on repeat, and keeps the first baseline', () => {
    let form = addCountScan(initialCount(), drill);
    form = addCountScan(form, { ...drill, stockQuantity: 99 });
    expect(form.lines).toHaveLength(1);
    expect(form.lines[0]).toMatchObject({ counted: 2, expected: 12, status: 'pending' });
  });

  it('refuses products without stock tracking and products already submitted', () => {
    expect(() => addCountScan(initialCount(), { ...drill, trackStock: false })).toThrow(/does not track/);
    const done = markLine(addCountScan(initialCount(), drill), 'p1', { status: 'done' });
    expect(() => addCountScan(done, drill)).toThrow(/already submitted/);
  });

  it('submits only unfinished lines whose count differs', () => {
    let form = addCountScan(addCountScan(initialCount(), drill), saw);
    form = setCounted(form, 'p1', 10); // -2
    form = setCounted(form, 'p2', 3); // matches
    expect(linesToSubmit(form).map((line) => line.productId)).toEqual(['p1']);
    expect(countSummary(form)).toMatchObject({ total: 2, changed: 1, matching: 1, submitted: 0 });
    expect(countPayload(form, form.lines.find((l) => l.productId === 'p1')!, 'pw')).toEqual({
      movementType: 'STOCK_COUNT', quantity: 10, expectedBefore: 12, reason: 'Stock count', note: null, accountPassword: 'pw',
    });
    expect(() => countPayload(form, form.lines[0]!, '')).toThrow(/password/);
  });

  it('treats a stale reply as done when the PC already shows the count (lost response)', () => {
    const line = setCounted(addCountScan(initialCount(), drill), 'p1', 10).lines[0]!;
    expect(resolveStale(line, 10).status).toBe('done');
    const conflict = resolveStale(line, 9);
    expect(conflict.status).toBe('conflict');
    expect(conflict.message).toMatch(/from 12 to 9/);
  });

  it('rebases a conflicted line onto the PC stock and makes it submittable again', () => {
    let form = setCounted(addCountScan(initialCount(), drill), 'p1', 10);
    form = markLine(form, 'p1', { status: 'conflict', message: 'changed' });
    expect(linesToSubmit(form)).toHaveLength(0);
    form = rebaseCountLine(form, 'p1', 9);
    expect(form.lines[0]).toMatchObject({ expected: 9, status: 'pending', message: null });
    expect(linesToSubmit(form)).toHaveLength(1);
  });

  it('rejects negative or fractional counts', () => {
    const form = addCountScan(initialCount(), drill);
    expect(() => setCounted(form, 'p1', -1)).toThrow();
    expect(() => setCounted(form, 'p1', 1.5)).toThrow();
  });
});

describe('receiving', () => {
  it('builds the desktop toCreateReceivingInput shape', () => {
    let form = { ...initialReceive('2026-11-12'), supplierId: 's1', referenceNumber: ' INV-9 ' };
    form = addReceiveScan(addReceiveScan(form, drill), drill);
    form = setReceiveQuantity(addReceiveScan(form, saw), 'p2', 24);
    expect(buildReceivingPayload(form, 'key-1', '2026-11-12')).toEqual({
      idempotencyKey: 'key-1',
      supplierId: 's1',
      referenceNumber: 'INV-9',
      note: null,
      receivedOn: '2026-11-12',
      items: [
        { productId: 'p2', quantity: 24 },
        { productId: 'p1', quantity: 2 },
      ],
    });
  });

  it('sends a null supplier when none is chosen and blocks future dates and empty documents', () => {
    const empty = initialReceive('2026-11-12');
    expect(() => buildReceivingPayload(empty, 'k', '2026-11-12')).toThrow(/at least one product/);
    const one = addReceiveScan(empty, drill);
    expect(buildReceivingPayload(one, 'k', '2026-11-12').supplierId).toBeNull();
    expect(() => buildReceivingPayload({ ...one, receivedOn: '2026-11-13' }, 'k', '2026-11-12')).toThrow(/future/);
    expect(() => setReceiveQuantity(one, 'p1', 0)).toThrow();
  });
});

describe('stock routes through the LAN gateway', () => {
  const client = { baseUrl: 'http://shop-pc:3011', token: 'access' };
  let fetchMock: ReturnType<typeof vi.fn>;
  const reply = (status: number, body: object) => ({ status, json: async () => body });
  let signOut: ReturnType<typeof vi.fn>, refresh: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setSelectedBranch('branch-a');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    signOut = vi.fn(async () => undefined);
    refresh = vi.fn(async () => 'fresh');
    configureApiSession({ baseUrl: client.baseUrl, getToken: () => 'access', refresh, signOut });
  });
  afterEach(() => {
    configureApiSession(null);
    setSelectedBranch(null);
    vi.unstubAllGlobals();
  });

  const guarded = { movementType: 'STOCK_COUNT' as const, quantity: 10, expectedBefore: 12, reason: 'Count', note: null, accountPassword: 'typo' };

  it('posts to the desktop stock-movements route with the branch header', async () => {
    fetchMock.mockResolvedValue(reply(201, { success: true, data: { changed: true, product: { id: 'p1', stockQuantity: 10 }, movement: null } }));
    await postMovement(client, 'p1', guarded);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://shop-pc:3011/api/v1/products/p1/stock-movements');
    expect(JSON.parse(init.body)).toEqual(guarded);
    expect(init.headers['X-Branch-Scope']).toBe('branch-a');
  });

  it('a wrong account password is a form error: no refresh, no sign-out', async () => {
    fetchMock.mockResolvedValue(reply(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Account password is incorrect' } }));
    const error = await postMovement(client, 'p1', guarded).catch((e) => e);
    expect(error).toBeInstanceOf(HcApiError);
    expect(error.code).toBe('ACCOUNT_PASSWORD');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('an expired login on a password request refreshes once and retries', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Session expired' } }))
      .mockResolvedValueOnce(reply(201, { success: true, data: { changed: true, product: { id: 'p1', stockQuantity: 10 }, movement: null } }));
    await postMovement(client, 'p1', guarded);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[1]![1].headers.Authorization).toBe('Bearer fresh');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('creates a receiving with its idempotency key in the body', async () => {
    fetchMock.mockResolvedValue(reply(201, { success: true, data: { id: 'r1', referenceNumber: null, receivedOn: '2026-11-12' } }));
    const payload = buildReceivingPayload(addReceiveScan(initialReceive('2026-11-12'), drill), 'key-9', '2026-11-12');
    await createReceiving(client, payload);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://shop-pc:3011/api/v1/inventory/receivings');
    expect(JSON.parse(init.body).idempotencyKey).toBe('key-9');
  });
});
