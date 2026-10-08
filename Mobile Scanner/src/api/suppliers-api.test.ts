import { afterEach, expect, it, vi } from 'vitest';
import { listSuppliers } from './suppliers-api';

afterEach(() => vi.unstubAllGlobals());

it('loads every supplier using authenticated pages within the backend limit of 100', async () => {
  const suppliers = Array.from({ length: 101 }, (_, index) => ({
    id: `supplier-${index}`, name: `Supplier ${index}`, phone: null,
  }));
  const fetchMock = vi.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input);
    expect(url.pathname).toBe('/api/v1/suppliers');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer mobile-token' });
    const pageSize = Number(url.searchParams.get('pageSize'));
    const page = Number(url.searchParams.get('page'));
    // Match supplierListQuerySchema: oversized requests fail before listing.
    if (pageSize > 100) {
      return { ok: false, status: 400, json: async () => ({
        success: false, error: { code: 'VALIDATION_ERROR', message: 'pageSize must be at most 100' },
      }) } as Response;
    }
    expect(pageSize).toBe(100);
    return { ok: true, status: 200, json: async () => ({
      success: true, data: suppliers.slice((page - 1) * pageSize, page * pageSize),
      meta: { pagination: { page, pageSize, totalItems: 101, totalPages: 2 } },
    }) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);

  await expect(listSuppliers({ baseUrl: 'http://127.0.0.1:3011', token: 'mobile-token' }))
    .resolves.toEqual(suppliers);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get('page'))).toEqual(['1', '2']);
});
