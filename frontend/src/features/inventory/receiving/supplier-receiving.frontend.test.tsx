import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierReceivingForm, createReceivingAndNavigate, receivingDetailPath, receivingErrorMessage, receivingPrefillFromRouteState, toCreateReceivingInput, validateReceivingForm, type ReceivingFormValues } from './components/SupplierReceivingForm';
import { NewSupplierReceivingPage } from './pages/NewSupplierReceivingPage';
import { SupplierReceivingDetailPage, supplierDebtPrefillForReceiving } from './pages/SupplierReceivingDetailPage';
import { SupplierReceivingListPage } from './pages/SupplierReceivingListPage';
import { supplierReceivingsApi } from './api/supplier-receivings.api';
import { SupplierReceivingHistory } from './components/SupplierReceivingHistory';

const receiving = {
  id: '11111111-1111-4111-8111-111111111111', supplierId: null, supplier: null, referenceNumber: null,
  note: 'Shelf delivery', receivedOn: '2026-08-14', receivedById: 'user-1', receivedBy: { id: 'user-1', fullName: 'Ali', username: 'ali' },
  createdAt: '2026-08-14T10:00:00.000Z', _count: { items: 1 }, items: [{
    id: 'item-1', receivingId: '11111111-1111-4111-8111-111111111111', productId: 'product-1', quantity: 4, stockMovementId: 'movement-1', createdAt: '2026-08-14T10:00:00.000Z',
    product: { id: 'product-1', name: 'Tracked fan', sku: 'HC-1', stockQuantity: 9 },
    stockMovement: { id: 'movement-1', productId: 'product-1', movementType: 'PURCHASE_RECEIPT' as const, quantityChange: 4, quantityBefore: 5, quantityAfter: 9, reason: 'Stock received', note: null, referenceType: 'SUPPLIER_RECEIVING_ITEM', referenceId: 'item-1', createdById: 'user-1', createdBy: null, createdAt: '2026-08-14T10:00:00.000Z' },
  }],
};

const { receivingHooks, apiMock, authState } = vi.hoisted(() => ({
  receivingHooks: { create: vi.fn(), list: vi.fn(), detail: vi.fn(), duplicate: vi.fn() },
  apiMock: { get: vi.fn(), post: vi.fn() },
  authState: { role: 'ADMIN' },
}));
vi.mock('./hooks/useSupplierReceivings', () => ({
  useCreateSupplierReceiving: () => ({ mutateAsync: receivingHooks.create, isPending: false }),
  useSupplierReceivings: (filters: unknown) => receivingHooks.list(filters),
  useSupplierReceiving: () => receivingHooks.detail(),
  useSupplierReceivingDuplicate: () => receivingHooks.duplicate(),
}));
vi.mock('../../products/hooks/useProducts', () => ({ useProducts: () => ({ data: { items: [
  { id: 'product-1', name: 'Tracked fan', model: 'TF-1', sku: 'HC-1', barcode: null, stockQuantity: 5, trackStock: true },
  { id: 'product-2', name: 'Untracked fan', model: 'UF-1', sku: 'HC-2', barcode: null, stockQuantity: 0, trackStock: false },
] }, isLoading: false, isError: false }) }));
vi.mock('../hooks/useInventory', () => ({ useProductInventory: () => ({ data: { onboardingStatus: 'ONBOARDED' }, isLoading: false, isError: false }) }));
vi.mock('../../suppliers/hooks/useSuppliers', () => ({ useSuppliers: () => ({ data: { items: [{ id: 'supplier-1', name: 'Supplier One' }] }, isLoading: false }) }));
vi.mock('../../../services/api', () => ({ api: apiMock }));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: authState.role } }) }));

const values = (changes: Partial<ReceivingFormValues> = {}): ReceivingFormValues => ({
  supplierId: '', referenceNumber: '', receivedOn: '2026-08-14', note: '', items: [{ key: 1, productId: 'product-1', quantity: '2' }], ...changes,
});

describe('supplier receiving frontend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'ADMIN';
    receivingHooks.list.mockReturnValue({ data: { items: [receiving], pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 } }, isLoading: false, isError: false });
    receivingHooks.detail.mockReturnValue({ data: receiving, isLoading: false, isError: false });
    receivingHooks.duplicate.mockReturnValue({ data: { duplicate: true, match: receiving }, isLoading: false });
  });

  it('renders the receiving list and only a view action', () => {
    const html = renderToStaticMarkup(<MemoryRouter><SupplierReceivingListPage /></MemoryRouter>);
    expect(html).toContain('Stock Receiving / إدخال المخزون');
    expect(html).toContain('No supplier / بدون مورّد');
    expect(html).toContain('View / عرض');
    expect(html).not.toContain('Edit / تعديل');
    expect(html).not.toContain('Delete / حذف');
  });

  it('renders read-only supplier receiving history with document links', () => {
    const html = renderToStaticMarkup(<MemoryRouter><SupplierReceivingHistory supplierId="supplier-1" /></MemoryRouter>);
    expect(receivingHooks.list).toHaveBeenCalledWith({ supplierId: 'supplier-1', page: 1, pageSize: 10 });
    expect(html).toContain('Receiving History / سجل إدخال المخزون');
    expect(html).toContain('separate from financial transactions');
    expect(html).toContain(`/inventory/receiving/${receiving.id}`);
    expect(html).toContain('Ali (ali)');
    for (const label of ['Edit / تعديل', 'Delete / حذف', 'Reverse / عكس', 'Payment / دفعة', 'Debt / دين']) expect(html).not.toContain(label);
  });

  it('renders the supplier receiving history empty state', () => {
    receivingHooks.list.mockReturnValueOnce({ data: { items: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }, isLoading: false, isError: false });
    const html = renderToStaticMarkup(<MemoryRouter><SupplierReceivingHistory supplierId="supplier-1" /></MemoryRouter>);
    expect(html).toContain('No receiving documents for this supplier / لا توجد مستندات إدخال لهذا المورد');
  });

  it('renders an optional supplier/reference form with no password or financial fields', () => {
    const html = renderToStaticMarkup(<MemoryRouter><SupplierReceivingForm /></MemoryRouter>);
    expect(html).toContain('Supplier (optional)');
    expect(html).toContain('Reference number (optional)');
    expect(html).toContain('Add line / إضافة سطر');
    expect(html).toContain('Search products');
    expect(html).toContain('Untracked fan');
    expect(html).toContain('Needs a verified opening count');
    expect(html).toMatch(/disabled=""[^>]*>[\s\S]*Untracked fan/);
    expect(html).not.toContain('Only stock-tracked products are shown');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('Cost / التكلفة');
    expect(html).not.toContain('Payment / دفعة');
    expect(html).not.toContain('Debt / دين');
    expect(html).not.toContain('Valuation / تقييم');
  });

  /**
   * The scanner's Receive Stock hand-off. Only a product id crosses the
   * boundary — quantity, supplier, and date stay the user's to enter, and the
   * form and backend still validate every one of them.
   */
  it('reads a scanner receiving hand-off out of the route state', () => {
    expect(receivingPrefillFromRouteState({ prefillReceivingProductId: 'product-1' })).toEqual({ productId: 'product-1' });
    expect(receivingPrefillFromRouteState({ prefillReceivingProductId: '' })).toBeNull();
    expect(receivingPrefillFromRouteState({ prefillReceivingProductId: 123 })).toBeNull();
    expect(receivingPrefillFromRouteState(undefined)).toBeNull();
    expect(receivingPrefillFromRouteState({})).toBeNull();
  });

  it('seeds the first line from a scanner hand-off and says so', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[{ pathname: '/inventory/receiving/new', state: { prefillReceivingProductId: 'product-1' } }]}>
        <Routes><Route path="/inventory/receiving/new" element={<NewSupplierReceivingPage />} /></Routes>
      </MemoryRouter>
    );
    expect(html).toContain('Scanned product added to the first line');
    expect(html).toContain('Tracked fan');
    // Quantity still defaults to 1 and is still editable.
    expect(html).toContain('value="1"');
  });

  it('opens an empty form for a direct visit with no hand-off', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/inventory/receiving/new']}>
        <Routes><Route path="/inventory/receiving/new" element={<NewSupplierReceivingPage />} /></Routes>
      </MemoryRouter>
    );
    expect(html).not.toContain('Scanned product added to the first line');
  });

  it('validates multiple unique product lines and the 1–100,000 quantity range', () => {
    expect(validateReceivingForm(values({ items: [{ key: 1, productId: 'product-1', quantity: '1' }, { key: 2, productId: 'product-2', quantity: '100000' }] }))).toEqual({});
    expect(validateReceivingForm(values({ items: [{ key: 1, productId: 'product-1', quantity: '1' }, { key: 2, productId: 'product-1', quantity: '2' }] }))).toMatchObject({ items: expect.stringContaining('cannot be added twice') });
    for (const quantity of ['0', '-1', '1.5', '100001']) expect(validateReceivingForm(values({ items: [{ key: 1, productId: 'product-1', quantity }] }))).toHaveProperty('items.0.quantity');
  });

  it('normalizes optional fields and navigates a successful submit to detail', async () => {
    expect(toCreateReceivingInput(values({ supplierId: '', referenceNumber: '  ', note: ' ' }))).toMatchObject({ supplierId: null, referenceNumber: null, note: null, items: [{ productId: 'product-1', quantity: 2 }] });
    expect(receivingDetailPath(receiving.id)).toBe(`/inventory/receiving/${receiving.id}`);
    const create = vi.fn().mockResolvedValue(receiving);
    const navigate = vi.fn();
    await createReceivingAndNavigate(values(), create, navigate);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ items: [{ productId: 'product-1', quantity: 2 }] }));
    expect(navigate).toHaveBeenCalledWith(`/inventory/receiving/${receiving.id}`);
  });

  it('shows duplicate lookup as a warning that is not a validation error', () => {
    const html = renderToStaticMarkup(<MemoryRouter><SupplierReceivingForm /></MemoryRouter>);
    expect(html).toContain('may already exist');
    expect(validateReceivingForm(values({ supplierId: 'supplier-1', referenceNumber: 'INV-1' }))).toEqual({});
  });

  it('preserves bilingual backend validation messages for display', () => {
    const error = { isAxiosError: true, response: { data: { error: { message: 'This product needs a verified opening count / يحتاج هذا المنتج جردًا مؤكدًا' } } } };
    expect(receivingErrorMessage(error)).toContain('verified opening count');
  });

  it('renders immutable detail, item movement balances, and no mutation controls', () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/inventory/receiving/${receiving.id}`]}><Routes><Route path="/inventory/receiving/:receivingId" element={<SupplierReceivingDetailPage />} /></Routes></MemoryRouter>);
    expect(html).toContain('This receiving document is immutable');
    expect(html).toContain('Tracked fan');
    expect(html).toContain('5 → 9');
    expect(html).not.toContain('Edit / تعديل');
    expect(html).not.toContain('Delete / حذف');
    expect(html).not.toContain('Reverse / عكس');
  });

  it('offers an admin-only debt bridge for an active receiving supplier without an amount', () => {
    const linkedReceiving = { ...receiving, supplierId: 'supplier-1', supplier: { id: 'supplier-1', name: 'Supplier One', isActive: true }, referenceNumber: 'INV-200' };
    receivingHooks.detail.mockReturnValueOnce({ data: linkedReceiving, isLoading: false, isError: false });
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/inventory/receiving/${receiving.id}`]}><Routes><Route path="/inventory/receiving/:receivingId" element={<SupplierReceivingDetailPage />} /></Routes></MemoryRouter>);
    expect(html).toContain('Record supplier debt / تسجيل دين للمورد');
    expect(supplierDebtPrefillForReceiving(linkedReceiving)).toEqual({ type: 'SUPPLIER_DEBT', transactionDate: '2026-08-14', reference: 'INV-200', description: 'Supplier receiving INV-200', supplierReceivingId: receiving.id });
    expect(supplierDebtPrefillForReceiving(linkedReceiving)).not.toHaveProperty('amount');

    authState.role = 'EMPLOYEE';
    receivingHooks.detail.mockReturnValueOnce({ data: linkedReceiving, isLoading: false, isError: false });
    expect(renderToStaticMarkup(<MemoryRouter initialEntries={[`/inventory/receiving/${receiving.id}`]}><Routes><Route path="/inventory/receiving/:receivingId" element={<SupplierReceivingDetailPage />} /></Routes></MemoryRouter>)).not.toContain('Record supplier debt');
  });

  it('shows the linked-debt route instead of offering a duplicate bridge', () => {
    const linkedReceiving = { ...receiving, supplierId: 'supplier-1', supplier: { id: 'supplier-1', name: 'Supplier One', isActive: true }, transactions: [{ id: 'transaction-1', type: 'SUPPLIER_DEBT', status: 'ACTIVE', amount: '25.00' }] };
    receivingHooks.detail.mockReturnValueOnce({ data: linkedReceiving, isLoading: false, isError: false });
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/inventory/receiving/${receiving.id}`]}><Routes><Route path="/inventory/receiving/:receivingId" element={<SupplierReceivingDetailPage />} /></Routes></MemoryRouter>);
    expect(html).toContain('View linked supplier debt');
    expect(html).toContain('/suppliers/supplier-1');
    expect(html).not.toContain('Record supplier debt');
  });

  it('calls list, detail, create, and warning-only duplicate APIs', async () => {
    apiMock.get.mockResolvedValue({ data: { data: receiving, meta: { pagination: { page: 1 } } } });
    apiMock.post.mockResolvedValue({ data: { data: receiving } });
    await supplierReceivingsApi.list({ page: 2 });
    expect(apiMock.get).toHaveBeenCalledWith('/inventory/receivings', { params: { page: 2 } });
    await supplierReceivingsApi.get(receiving.id);
    expect(apiMock.get).toHaveBeenCalledWith(`/inventory/receivings/${receiving.id}`);
    const input = toCreateReceivingInput(values());
    await supplierReceivingsApi.create(input);
    expect(apiMock.post).toHaveBeenCalledWith('/inventory/receivings', input);
    await supplierReceivingsApi.duplicateCheck('supplier-1', 'INV-1');
    expect(apiMock.get).toHaveBeenCalledWith('/inventory/receivings/duplicate-check', { params: { supplierId: 'supplier-1', referenceNumber: 'INV-1' } });
  });
});
