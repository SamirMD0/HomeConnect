import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, authState, createState, productHook, productState } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  authState: { user: { id: 'admin-1', role: 'ADMIN' } },
  createState: { isPending: false, mutateAsync: vi.fn() },
  productHook: vi.fn(),
  productState: {
    data: undefined as Record<string, unknown> | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({ api: apiMock }));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('../../products/hooks/useProducts', () => ({
  useProduct: (id: string) => {
    productHook(id);
    return productState;
  },
}));
vi.mock('../hooks/useSalesOrders', () => ({ useCreateSalesOrder: () => createState }));
vi.mock('../../customers/hooks/useCustomerSearch', () => ({
  useCustomerSearch: () => ({
    query: '',
    setQuery: vi.fn(),
    customers: { data: { data: [] }, isLoading: false, isFetching: false },
    suggestions: { data: [] },
  }),
}));
vi.mock('../../customers/hooks/useCustomers', () => ({
  useCreateCustomer: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

import {
  ScannerQuickOrderDialog,
  ScannerQuickOrderServerError,
  ScannerQuickOrderSuccess,
} from './ScannerQuickOrderDialog';

const baseProduct = {
  id: 'product-1',
  sku: 'HC-000001',
  name: 'Coffee grinder',
  model: 'CG-8',
  barcode: '1234567890123',
  brand: 'Home',
  price: '40.00',
  discount: null,
  netPrice: '38.00',
  isActive: true,
  imageUrl: null,
  image: null,
  notes: null,
  labelBarcodeSource: 'SKU',
  trackStock: true,
  stockQuantity: 4,
  lowStockThreshold: 1,
  stockStatus: 'IN_STOCK',
  specifications: [],
  specificationNotes: null,
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
  pricing: {
    pricingAvailable: true,
    mode: 'PRESET',
    source: 'PRESET',
    pricingPresetId: 'preset-1',
    presetName: 'Standard',
    useCustomPricing: false,
    installmentEnabled: false,
    cashPrice: '35.00',
    warnings: [],
  },
};

const renderDialog = (isOpen = true) => renderToStaticMarkup(
  <MemoryRouter>
    <ScannerQuickOrderDialog productId="product-1" isOpen={isOpen} onClose={() => undefined} />
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { id: 'admin-1', role: 'ADMIN' };
  productState.data = baseProduct;
  productState.isLoading = false;
  productState.isError = false;
  createState.isPending = false;
});

describe('ScannerQuickOrderDialog', () => {
  it('renders the scanned product identity, stock status, and selling price', () => {
    const html = renderDialog();
    expect(html).toContain('Scanner Quick Order / طلب سريع من السكانر');
    expect(html).toContain('Coffee grinder');
    expect(html).toContain('CG-8 · Home');
    expect(html).toContain('HC-000001');
    expect(html).toContain('1234567890123');
    expect(html).toContain('In stock / متوفر');
    expect(html).toContain('$35.00');
  });

  it('renders one line, three payment choices, the customer picker, notes, totals, and submit', () => {
    const html = renderDialog();
    for (const text of [
      'Quantity / الكمية',
      'Unit price / سعر الوحدة',
      'Paid in full / مدفوع بالكامل',
      'Partial / دفعة جزئية',
      'Debt / دين',
      'Search customer / البحث عن زبون',
      'Quick create / إضافة سريعة',
      'Order note (optional) / ملاحظة الطلب (اختياري)',
      'Total / الإجمالي',
      'Remaining / المتبقي',
      'Create Sales Order / إنشاء طلب بيع',
    ]) expect(html).toContain(text);
  });

  it('contains no wizard, product-search, multi-line, manual-product, or password controls', () => {
    const html = renderDialog();
    expect(html).not.toContain('Search by name, model, SKU or barcode');
    expect(html).not.toContain('Add another item');
    expect(html).not.toContain('Use manual product');
    expect(html).not.toMatch(/Step \d+ of 6/);
    expect(html).not.toContain('of 6');
    expect(html).not.toContain('type="password"');
  });

  it('shows the admin fully-paid customer hint', () => {
    expect(renderDialog()).toContain('Optional for an admin-recorded fully paid sale');
  });

  it('shows archived and loading/error states with no create action', () => {
    productState.data = { ...baseProduct, isActive: false };
    const archived = renderDialog();
    expect(archived).toContain('Archived product');
    expect(archived).not.toContain('Create Sales Order / إنشاء طلب بيع');

    productState.data = undefined;
    productState.isLoading = true;
    expect(renderDialog()).toContain('Loading product');
    productState.isLoading = false;
    productState.isError = true;
    const failed = renderDialog();
    expect(failed).toContain('Unable to load product details');
    expect(failed).toContain('Retry / إعادة المحاولة');
  });

  it('passes an empty id to the product hook while closed', () => {
    renderDialog(false);
    expect(productHook).toHaveBeenCalledWith('');
  });

  it('renders a server message verbatim inside an alert', () => {
    const html = renderToStaticMarkup(<ScannerQuickOrderServerError message="Exact backend refusal" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Exact backend refusal');
  });

  it('renders the success order number and both next actions', () => {
    const html = renderToStaticMarkup(<ScannerQuickOrderSuccess
      order={{ id: 'order-1', orderNumber: 'SO-000123' }}
      onOpenOrder={() => undefined}
      onScanNext={() => undefined}
    />);
    expect(html).toContain('SO-000123');
    expect(html).toContain('Open order / فتح الطلب');
    expect(html).toContain('Scan next / مسح التالي');
  });

  it('issues no write on render and never calls a stock mutation URL', () => {
    renderDialog();
    expect(createState.mutateAsync).not.toHaveBeenCalled();
    expect(apiMock.post).not.toHaveBeenCalled();
    const urls = apiMock.post.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('deduct-stock') || url.includes('restore-stock'))).toBe(false);
  });
});
