import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORT_CATALOG, REPORT_PATHS } from '@shared/report-catalog';
import { getDashboard } from './dashboard-api';
import {
  getProduct,
  getInventory,
  getBrands,
  getCategories,
  listProducts,
  listMovements,
} from './catalog-api';
import {
  getCustomer,
  getCustomerFinancial,
  getCustomerStatement,
  listCustomers,
} from './customers-api';
import {
  getSupplier,
  getSupplierStatement,
  listSupplierLookup,
  listPurchases,
  listBills,
  getBillImage,
} from './supplier-lookup-api';
import { getSalesOrder, listSalesOrders } from './sales-orders-api';
import { getReport, reportRequest } from './reports-api';
import { lookupParams } from './lookup-http';
import { configureApiSession } from './hc-client';
import { setSelectedBranch } from '../branches/branch-selection';
const client = { baseUrl: 'http://pc:3011', token: 'access' },
  range = { from: '2026-11-01', to: '2026-11-12' };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setSelectedBranch('branch-a');
  fetchMock = vi.fn(async () => ({ status: 200, json: async () => ({ success: true, data: [] }) }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  configureApiSession(null);
  setSelectedBranch(null);
  vi.unstubAllGlobals();
});
async function expectGet(
  run: () => Promise<unknown>,
  path: string,
  params: Record<string, string>,
  data: unknown = []
) {
  fetchMock.mockResolvedValue({ status: 200, json: async () => ({ success: true, data }) });
  await run();
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  const parsed = new URL(url);
  expect(parsed.origin).toBe('http://pc:3011');
  expect(parsed.pathname).toBe(`/api/v1${path}`);
  expect(Object.fromEntries(parsed.searchParams)).toEqual(params);
  expect(init.method).toBe('GET');
  expect(init.body).toBeUndefined();
  expect(init.headers).toMatchObject({
    Authorization: 'Bearer access',
    'X-Branch-Scope': 'branch-a',
  });
}
describe('desktop lookup wire contracts through the LAN client', () => {
  it('reads dashboard nested meta/data without altering server values', async () => {
    const data = {
      meta: { businessDate: '2026-11-12', range },
      data: {
        kpis: [{ key: 'outstandingDebt', value: '9007199254740993.25', valueKind: 'money' }],
      },
    };
    await expectGet(
      async () =>
        expect(
          await getDashboard(client, { range: 'custom', ...range, includeArchived: false })
        ).toEqual(data),
      '/dashboard/overview',
      { range: 'custom', ...range, includeArchived: 'false' },
      data
    );
  });
  it('searches products with the exact desktop filters and a bounded server page', async () => {
    await expectGet(
      () =>
        listProducts(
          client,
          { search: 'SKU & 123', brand: 'Cedar', categoryId: 'category', isActive: true },
          2
        ),
      '/products',
      {
        search: 'SKU & 123',
        brand: 'Cedar',
        categoryId: 'category',
        isActive: 'true',
        page: '2',
        pageSize: '25',
        sortBy: 'name',
        sortOrder: 'asc',
      }
    );
  });
  it.each([
    [() => getProduct(client, 'p'), '/products/p'],
    [() => getInventory(client, 'p'), '/products/p/inventory'],
    [() => getCategories(client), '/categories'],
    [() => getCustomer(client, 'c'), '/customers/c'],
    [() => getCustomerFinancial(client, 'c'), '/customers/c/financial-summary'],
    [() => getSupplier(client, 's'), '/suppliers/s'],
    [() => getSalesOrder(client, 'order'), '/sales-orders/order'],
  ] as const)('uses an existing read route %#', async (run, path) => {
    await expectGet(run, path, {});
  });
  it('reads the brand envelope', async () => {
    const brands = [{ canonical: 'Cedar', productCount: 2 }];
    await expectGet(
      async () => expect(await getBrands(client)).toEqual(brands),
      '/products/brands',
      {},
      { brands }
    );
  });
  it('pages global stock movement history by product', async () => {
    await expectGet(() => listMovements(client, 'p', 3), '/inventory/movements', {
      productId: 'p',
      page: '3',
      pageSize: '25',
    });
  });
  it('includes financial snapshots in the customer list, never one request per row', async () => {
    const rows = [{ id: 'c', financial: { outstanding: '125.50' } }];
    await expectGet(
      async () => expect((await listCustomers(client, 'Customer', 2)).items).toEqual(rows),
      '/customers',
      {
        search: 'Customer',
        page: '2',
        limit: '25',
        include: 'financial',
        sortBy: 'name',
        sortOrder: 'asc',
      },
      rows
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([
    [() => getCustomerStatement(client, 'c', range), '/customers/c/statement'],
    [() => getSupplierStatement(client, 's', range), '/suppliers/s/statement'],
  ] as const)('reads server statement balances and running balances %#', async (run, path) => {
    const data = {
      openingBalance: '1.00',
      closingBalance: '-45.50',
      entries: [{ runningBalance: '-45.50', balanceEffect: '-46.50' }],
    };
    await expectGet(async () => expect(await run()).toEqual(data), path, range, data);
  });
  it('reads included supplier balances and pages purchases', async () => {
    await expectGet(() => listSupplierLookup(client, 'Supplier', 2), '/suppliers', {
      search: 'Supplier',
      page: '2',
      pageSize: '25',
      sortBy: 'name',
      sortOrder: 'asc',
    });
    fetchMock.mockClear();
    await expectGet(() => listPurchases(client, 's', 2), '/suppliers/s/purchases', {
      page: '2',
      pageSize: '25',
    });
  });
  it('reads supplier bills with the desktop linked filter', async () => {
    await expectGet(() => listBills(client, 's', 'false'), '/suppliers/s/bills', {
      linked: 'false',
    });
  });
  it('serializes sales order status/date/customer filters exactly as desktop', async () => {
    await expectGet(
      () =>
        listSalesOrders(
          client,
          {
            fulfillmentStatus: ['DRAFT', 'CONFIRMED'],
            paymentStatus: ['UNPAID'],
            dateFrom: range.from,
            dateTo: range.to,
            customerId: 'c',
          },
          2
        ),
      '/sales-orders',
      {
        fulfillmentStatus: 'DRAFT,CONFIRMED',
        paymentStatus: 'UNPAID',
        dateFrom: range.from,
        dateTo: range.to,
        customerId: 'c',
        sort: 'createdDesc',
        page: '2',
        pageSize: '25',
      }
    );
  });
  it.each(REPORT_CATALOG)('uses the desktop report route for $title', async (report) => {
    const filters = { period: 'custom' as const, ...range, month: '2026-11' };
    const request = reportRequest(report, filters, 2);
    if (report.kind === 'rows') expect(request.path).toBe(`/reports/${REPORT_PATHS[report.slice]}`);
    await expectGet(
      () => getReport(client, report, filters, 2),
      request.path,
      Object.fromEntries(
        Object.entries(request.params).map(([key, value]) => [key, String(value)])
      ),
      { summary: { totalAmount: '125.50' }, rows: [] }
    );
  });
  it('drops blank params, preserves false, and never sends custom dates for preset reports', () => {
    expect(lookupParams({ a: '', b: undefined, c: false, d: ['PAID', 'UNPAID'] })).toBe(
      'c=false&d=PAID%2CUNPAID'
    );
    expect(reportRequest(REPORT_CATALOG[0], { period: 'thisMonth', ...range }).params).toEqual({
      period: 'thisMonth',
    });
  });
  it('fetches bill bytes with auth and branch headers and creates a data URI, never a token URL', async () => {
    configureApiSession({
      baseUrl: client.baseUrl,
      getToken: () => 'access',
      refresh: vi.fn(),
      signOut: vi.fn(),
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['image'], { type: 'image/jpeg' }),
    });
    vi.stubGlobal(
      'FileReader',
      class {
        result = 'data:image/jpeg;base64,aW1hZ2U=';
        onload?: () => void;
        readAsDataURL() {
          this.onload?.();
        }
      }
    );
    const result = await getBillImage(client, {
      id: 'b',
      supplierId: 's',
      branchId: 'bill-branch',
      supplierReceivingId: null,
      note: null,
      mime: 'image/jpeg',
      bytes: 5,
      capturedAt: '',
    });
    expect(result).toMatch(/^data:image/);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://pc:3011/api/v1/supplier-bills/b/image',
      expect.objectContaining({
        headers: { Authorization: 'Bearer access', 'X-Branch-Scope': 'bill-branch' },
      })
    );
  });
});
