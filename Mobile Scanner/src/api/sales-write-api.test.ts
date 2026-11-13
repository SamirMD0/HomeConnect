import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOrder,
  createCustomer,
  getPaymentReceipt,
  getReceiptBusiness,
  getPaymentTargets,
  recordPayment,
} from './sales-write-api';
import { setSelectedBranch } from '../branches/branch-selection';
import { configureApiSession } from './hc-client';
import {
  initialOrder,
  buildOrderPayload,
  initialPayment,
  buildPaymentPayload,
} from '../sales/payloads';
const client = { baseUrl: 'http://shop-pc:3011', token: 'access', branchId: 'branch-a' };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setSelectedBranch('branch-a');
  fetchMock = vi
    .fn()
    .mockResolvedValue({
      status: 200,
      json: async () => ({
        success: true,
        data: { id: 'server-record', totalAmount: '9007199254740993.25' },
      }),
    });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  configureApiSession(null);
  setSelectedBranch(null);
  vi.unstubAllGlobals();
});
describe('same desktop write and receipt routes through port 3011', () => {
  it('posts the original order key in the JSON body with a pinned branch, retaining server money', async () => {
    const form = {
      ...initialOrder(),
      customerId: 'customer',
      items: [
        {
          productId: 'p',
          name: 'Fixture',
          sku: 'QA',
          quantity: '1',
          unitPrice: '139.00',
          discountAmount: '0.00',
        },
      ],
    };
    const payload = buildOrderPayload(form, 'uuid-key', true);
    setSelectedBranch('branch-b');
    expect((await createOrder(client, payload)).totalAmount).toBe('9007199254740993.25');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://shop-pc:3011/api/v1/sales-orders');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer access',
      'X-Branch-Scope': 'branch-a',
    });
    expect(init.headers).not.toHaveProperty('Idempotency-Key');
  });
  it.each(['DEBT', 'INSTALLMENT_PLAN'] as const)(
    'sends %s allocations using the existing obligation-specific route',
    async (targetType) => {
      const form = {
          ...initialPayment('customer'),
          targetType,
          targetId: 'target',
          amount: '25.50',
        },
        payload = buildPaymentPayload(form, 'same-key');
      await recordPayment(client, form, payload);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `http://shop-pc:3011/api/v1/${targetType === 'DEBT' ? 'debts' : 'installment-plans'}/target/payments`
      );
      expect(JSON.parse(init.body as string)).toEqual(payload);
    }
  );
  it('creates customers with the desktop required fields', async () => {
    const payload = { name: 'Fixture Customer', phone: '12345', address: '', notes: '' };
    await createCustomer(client, payload);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://shop-pc:3011/api/v1/customers');
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual(payload);
  });
  it.each([
    [() => getPaymentReceipt(client, 'p'), '/payments/p/receipt'],
    [() => getReceiptBusiness(client), '/business-settings'],
    [
      () => getPaymentTargets(client, 'c'),
      '/customers/c/financial-summary?includeCancelled=false&includePayments=false&debtLimit=100&planLimit=100',
    ],
  ] as const)('reuses a desktop GET contract %#', async (run, path) => {
    await run();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://shop-pc:3011/api/v1${path}`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });
});
