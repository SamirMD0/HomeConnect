import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryDb } from './testing/memory-db';
import { applyRecords } from './record-store';
import { CloudDataSource } from './data-source';
import { configureCloudReader, setCloudMode } from './cloud-mode';
import { setSelectedBranch } from '../branches/branch-selection';
import { listProducts, getProduct, getInventory, getCategories } from '../api/catalog-api';
import { getCustomer, getCustomerFinancial, listCustomers } from '../api/customers-api';
import { getSupplier, listBills, getBillImage } from '../api/supplier-lookup-api';
import { getSalesOrder, listSalesOrders } from '../api/sales-orders-api';
import { getReceivablesPage } from '../api/receivables-api';
import { scanLookup } from '../api/products-api';
import { requestJson } from '../api/hc-client';
const client = { baseUrl: 'https://relay.example', token: 'cloud-local-session' };
const money = '9007199254740993.25';
const product = { id: 'product', name: 'Desk fan', model: 'F1', sku: 'FAN-001', barcode: '0012345678901', brand: 'Cedar', categoryId: 'child', isActive: true,
  price: money, netPrice: money, priceCurrency: 'USD', stockQuantity: 3, stockStatus: 'IN_STOCK', trackStock: true,
  pricing: { cashPrice: money, cashPriceIncVat: money, monthlyPayment: '450359962737049.66' },
  inventory: { product: { stockQuantity: 3, trackStock: true, stockStatus: 'IN_STOCK', lowStockThreshold: 1 }, onboardingStatus: 'ONBOARDED', recentMovements: [] } };
const financialSummary = { customer: { id: 'customer', name: 'Mira', phone: '12345678' }, summary: { totalOutstanding: money, totalPaid: '1.01', nextDueAmount: '4.99' }, debts: [{ id: 'debt', originalAmount: money, remainingBalance: money }], installmentPlans: [] };
const customer = { id: 'customer', branchId: 'a', name: 'Mira', phone: '12345678', isActive: true, financial: { outstanding: money, overdueAmount: '99.01', tier: 'LATE', tierReason: 'Payment overdue', maxOverdueDays: 12, nextDueDate: '2026-11-01', lastPaymentDate: '2026-10-01' }, financialSummary };
const supplier = { id: 'supplier', branchId: 'a', name: 'Supplier', phone: '99887766', balance: '-100.01', summary: { totalOwed: money, totalPaid: money, totalCredit: '100.01', balance: '-100.01' } };
const order = { id: 'order', branchId: 'a', orderNumber: 'SO-1', customerId: customer.id, orderDate: '2026-11-15', totalAmount: money, items: [] };
const bill = { id: 'bill', branchId: 'a', supplierId: supplier.id, supplierName: supplier.name, note: 'Invoice', capturedAt: '2026-11-16T00:00:00Z', pageCount: 1, pages: [] };
let source: CloudDataSource;
beforeEach(async () => {
  const db = await memoryDb();
  await applyRecords(db, 'records', [
    ['product', product], ['customer', customer], ['supplier', supplier], ['sales_order', order], ['supplier_bill', bill],
    ['category', { id: 'root', name: 'Appliances', parentId: null }], ['category', { id: 'child', name: 'Fans', parentId: 'root' }],
    ['customer', { id: 'secret', branchId: 'b', name: 'Other branch', phone: '12345678', financial: { outstanding: '77.00' } }],
    ['branch', { id: 'a', branchId: 'a', name: 'Main' }],
  ].map(([entity, data]) => ({ entity: entity as string, id: (data as any).id, branchId: (data as any).branchId ?? null, op: 'upsert', data, rev: '1' })));
  source = new CloudDataSource(db, ['a']); setSelectedBranch('a');
  configureCloudReader((url, init) => source.read(url, init)); setCloudMode(true);
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('A cloud screen must never fetch PC data'); }));
});
afterEach(() => { setCloudMode(false); configureCloudReader(null); setSelectedBranch(null); vi.unstubAllGlobals(); });
describe('existing screen APIs backed by phone SQLite', () => {
  it('returns product list/detail/inventory shapes with exact PC prices and search/filter behavior', async () => {
    expect((await listProducts(client, { search: '001234', categoryId: 'root' })).items).toEqual([product]);
    expect(await getProduct(client, 'product')).toEqual(product);
    expect(await getInventory(client, 'product')).toEqual(product.inventory);
    expect((await getCategories(client)).map(item => item.id)).toEqual(['root', 'child']);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('matches barcodes before SKU, keeps leading zeros, and returns the scanner shape', async () => {
    expect(await scanLookup(client, '\t0012345678901\r\n')).toEqual({ status: 'FOUND', matchedBy: 'BARCODE', normalizedCode: '0012345678901',
      product: { id: product.id, name: product.name, model: product.model, sku: product.sku, barcode: product.barcode, brand: product.brand, isActive: product.isActive } });
    expect((await scanLookup(client, 'fan-001')).matchedBy).toBe('SKU');
    expect((await scanLookup(client, 'nope')).status).toBe('NOT_FOUND');
  });
  it('passes through customer financial summary and supplier balances without arithmetic', async () => {
    expect(await getCustomer(client, 'customer')).toEqual(customer);
    expect(await getCustomerFinancial(client, 'customer')).toEqual(financialSummary);
    expect(await getSupplier(client, 'supplier')).toEqual(supplier);
    const list = await listCustomers(client, '1234'); expect(list.items).toEqual([customer]);
    const receivables = await getReceivablesPage(client, { tiers: ['LATE'] }, 1);
    expect(receivables.summary).toBeNull();
    expect(receivables.items[0]).toMatchObject({ outstanding: money, overdueAmount: '99.01', tier: 'LATE' });
  });
  it('enforces branch visibility for details even when their JSON ID matches', async () => {
    await expect(getCustomer(client, 'secret')).rejects.toThrow('not in your phone data');
    await expect(source.read('https://relay.example/api/v1/customers', { headers: { 'X-Branch-Scope': 'b' } })).rejects.toThrow('not paired');
  });
  it('returns order and bill metadata unchanged and never downloads bill photos', async () => {
    expect(await getSalesOrder(client, 'order')).toEqual(order);
    expect((await listSalesOrders(client, { dateFrom: '2026-11-01' })).items).toEqual([order]);
    expect(await listBills(client, 'supplier')).toEqual([bill]);
    await expect(getBillImage(client, bill as any)).rejects.toThrow('Photo available on the shop Wi-Fi');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects direct write calls before any network or database mutation', async () => {
    await expect(requestJson('https://relay.example/api/v1/sales-orders', { method: 'POST', body: '{}' })).rejects.toThrow('Coming soon over the cloud');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves the existing HTTP path and response when LAN mode is selected', async () => {
    setCloudMode(false);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true, data: customer })));
    expect(await getCustomer({ baseUrl: 'http://pc:3011', token: 'lan-access' }, 'customer')).toEqual(customer);
    expect(fetch).toHaveBeenCalledWith('http://pc:3011/api/v1/customers/customer', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer lan-access' }) }));
  });
});
