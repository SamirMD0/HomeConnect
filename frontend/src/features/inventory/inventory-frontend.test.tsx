import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductStockSection } from '../products/components/ProductStockSection';
import { ScanFeedback } from '../scanner/components/ScanFeedback';
import { InventoryPage } from '../../pages/inventory/InventoryPage';
import { InventoryDashboardCards } from './components/InventoryDashboardCards';
import { MovementHistory } from './components/MovementHistory';
import { movementAfter, validateMovementForm } from './utils/stock-movement';
import { inventoryApi } from './api/inventory.api';
import { ProductInventoryPanel } from './components/ProductInventoryPanel';
import { StockMovementDialog } from './components/StockMovementDialog';
import { validateOpeningCountForm, VerifyOpeningCountDialog } from './components/VerifyOpeningCountDialog';

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../services/api', () => ({ api: apiMock }));
vi.mock('./hooks/useInventory', () => ({
  useInventorySummary: () => ({ data: { trackedProducts: 2, lowStockProducts: 1, outOfStockProducts: 1, movementsToday: 2, ordersAwaitingStockDeduction: 3, totalUnits: 4, recentMovements: [] }, isLoading: false }),
  useLowStockProducts: () => ({ data: { items: [{ id: 'p1', sku: 'HC-1', name: 'Low fan', barcode: null, stockQuantity: 1, lowStockThreshold: 2, stockStatus: 'LOW_STOCK' }] } }),
  useProductInventory: (id: string) => ({ data: {
    product: { id, sku: 'HC-1', name: 'Low fan', isActive: true, trackStock: id !== 'not-in', stockQuantity: id === 'pending' ? 3 : id === 'not-in' ? 0 : 1, lowStockThreshold: 2, stockStatus: id === 'not-in' ? 'NOT_TRACKED' : 'LOW_STOCK' },
    onboardingStatus: id === 'pending' ? 'PENDING_ONBOARDING' : id === 'not-in' ? 'NOT_IN_INVENTORY' : 'ONBOARDED',
    recentMovements: id === 'p1' ? [movement] : [],
  }, isLoading: false, isError: false }),
  useCreateStockMovement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVerifyOpeningCount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'ADMIN' } }) }));
vi.mock('../products/hooks/useProducts', () => ({
  useProducts: () => ({ data: { items: [
    { id: 'p1', sku: 'HC-1', name: 'Low fan', barcode: null, stockQuantity: 1, stockStatus: 'LOW_STOCK', trackStock: true },
    { id: 'p2', sku: 'HC-2', name: 'Untracked fan', barcode: null, stockQuantity: 0, stockStatus: 'NOT_TRACKED', trackStock: false },
  ] } }),
}));
vi.mock('../scanner/hooks/useScannerLookup', () => ({ useScannerLookup: () => ({ submit: vi.fn(), clear: vi.fn(), result: null, isLooking: false, isError: false }) }));
vi.mock('../scanner/hooks/useScannerEvents', () => ({ useScannerEvents: vi.fn() }));
vi.mock('./components/InventoryProductDrawer', () => ({ InventoryProductDrawer: () => null }));

const movement = {
  id: 'm1', productId: 'p1', movementType: 'MANUAL_ADD' as const, quantityChange: 2, quantityBefore: 1, quantityAfter: 3,
  reason: 'New delivery / تسليم جديد', note: 'Shelf A', referenceType: null, referenceId: null, createdById: 'u1',
  createdBy: { id: 'u1', fullName: 'Ali', username: 'ali' }, createdAt: '2026-08-12T10:00:00Z',
};

describe('inventory frontend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps quantity read-only in product settings', () => {
    const html = renderToStaticMarkup(<ProductStockSection value={{ trackStock: true, stockQuantity: 12, lowStockThreshold: 2 }} onChange={() => undefined} />);
    expect(html).toContain('Current quantity');
    expect(html).toContain('<output');
    expect(html).not.toContain('value="12"');
    expect(html).toContain('إعدادات المخزون');
  });

  it('renders newest-style movement details with bilingual user text', () => {
    const html = renderToStaticMarkup(<MovementHistory movements={[movement]} />);
    expect(html).toContain('1 → 3');
    expect(html).toContain('New delivery / تسليم جديد');
    expect(html).toContain('dir="auto"');
    expect(html).toContain('Ali (ali)');
  });

  it('links sale movements to their authoritative fulfillment order', () => {
    const saleMovement = {
      ...movement,
      movementType: 'SALE_FULFILLMENT' as const,
      salesFulfillmentMovement: { salesOrder: { id: 'order-1', orderNumber: 'SO-2026-0001' } },
    };
    const html = renderToStaticMarkup(<MemoryRouter><MovementHistory movements={[saleMovement]} /></MemoryRouter>);
    expect(html).toContain('/sales-orders/order-1');
    expect(html).toContain('Sales order SO-2026-0001');
  });

  it('renders the product inventory panel, history, and all five action choices', () => {
    const html = renderToStaticMarkup(<ProductInventoryPanel productId="p1" />);
    for (const label of ['Add / إضافة', 'Remove / إزالة', 'Count / جرد', 'Damage/loss / تلف أو فقدان', 'Return / إعادة']) expect(html).toContain(label);
    expect(html).toContain('Movement history / سجل الحركات');
    expect(html).toContain('1 → 3');
  });

  it('shows the opening-count action in the pending warning and unlocks actions after onboarding', () => {
    const pending = renderToStaticMarkup(<ProductInventoryPanel productId="pending" />);
    expect(pending).toContain('This product needs a verified opening count');
    expect(pending).toContain('Verify Opening Count / تأكيد الجرد الافتتاحي');
    expect(pending).toContain('disabled=""');

    const onboarded = renderToStaticMarkup(<ProductInventoryPanel productId="p1" />);
    expect(onboarded).not.toContain('This product needs a verified opening count');
    expect(onboarded).not.toContain('disabled=""');
  });

  it('shows NOT_IN_INVENTORY as neutral instead of pending and still lets admins start onboarding', () => {
    const html = renderToStaticMarkup(<ProductInventoryPanel productId="not-in" />);
    expect(html).toContain('This product is not in inventory');
    expect(html).not.toContain('needs a verified opening count');
    expect(html).toContain('Verify Opening Count / تأكيد الجرد الافتتاحي');
  });

  it('accepts zero and nonzero verified counts while requiring the admin password', () => {
    expect(validateOpeningCountForm(0, 'Counted shelf', 'secret')).toEqual({});
    expect(validateOpeningCountForm(7, 'Counted shelf', 'secret')).toEqual({});
    expect(validateOpeningCountForm(0, 'Counted shelf', '')).toMatchObject({ accountPassword: expect.any(String) });
    expect(validateOpeningCountForm(-1, 'Counted shelf', 'secret')).toMatchObject({ verifiedCount: expect.any(String) });
    const html = renderToStaticMarkup(<VerifyOpeningCountDialog productId="p1" productName="Low fan" open onClose={() => undefined} />);
    expect(html).toContain('Zero is valid for an empty shelf');
    expect(html).toContain('Account password / كلمة مرور الحساب');
  });

  it('validates all five dialogs and previews both directions and count totals', () => {
    expect(movementAfter('MANUAL_ADD', 12, 5)).toBe(17);
    expect(movementAfter('MANUAL_REMOVE', 12, 5)).toBe(7);
    expect(movementAfter('DAMAGE_LOSS', 12, 5)).toBe(7);
    expect(movementAfter('RETURN_TO_STOCK', 12, 5)).toBe(17);
    expect(movementAfter('STOCK_COUNT', 12, 5)).toBe(5);
    expect(validateMovementForm('MANUAL_ADD', 0, '', '')).toMatchObject({ quantity: expect.any(String), reason: expect.any(String) });
    expect(validateMovementForm('STOCK_COUNT', 0, 'Counted shelf', '')).toMatchObject({ accountPassword: expect.any(String) });
    expect(validateMovementForm('MANUAL_REMOVE', 1, 'Correction', '')).toMatchObject({ accountPassword: expect.any(String) });
  });

  it('omits the reason field and Arabic action labels from the stock-count dialog', () => {
    const html = renderToStaticMarkup(<StockMovementDialog productId="p1" productName="Low fan" currentQuantity={12} type="STOCK_COUNT" onClose={() => undefined} />);
    expect(html).not.toContain('Reason / السبب');
    expect(html).not.toContain('Cancel / إلغاء');
    expect(html).not.toContain('Confirm / تأكيد');
    expect(html).toContain('>Cancel</button>');
    expect(html).toContain('>Confirm</button>');
  });

  it('renders summary cards, all filters, search, products, and recent movement section', () => {
    const html = renderToStaticMarkup(<MemoryRouter><InventoryPage /></MemoryRouter>);
    expect(html).toContain('Inventory / المخزون');
    expect(html).toContain('Tracked products');
    expect(html).toContain('Low stock / منخفض');
    expect(html).toContain('Out of stock / نافد');
    expect(html).toContain('Untracked / غير متتبع');
    expect(html).toContain('Search or scan product');
    expect(html).toContain('Low fan');
    expect(html).toContain('Recent stock movements');
  });

  it('adds the awaiting-deduction dashboard counter and filtered sales-order link', () => {
    const html = renderToStaticMarkup(<MemoryRouter><InventoryDashboardCards /></MemoryRouter>);
    expect(html).toContain('Orders awaiting stock deduction');
    expect(html).toContain('>3<');
    expect(html).toContain('/sales-orders?mode=all&amp;awaitingStockDeduction=true');
  });

  it('shows unresolved code and a manual-search action without creating anything', () => {
    const html = renderToStaticMarkup(<ScanFeedback result={{ status: 'NOT_FOUND', normalizedCode: 'HC-MISSING', matchedBy: null, product: null }} isLooking={false} isError={false} onManualSearch={() => undefined} />);
    expect(html).toContain('HC-MISSING');
    expect(html).toContain('Manual search / بحث يدوي');
  });

  it('uses the inventory API and never sends quantity through the settings endpoint', async () => {
    apiMock.get.mockResolvedValue({ data: { data: [], meta: { pagination: { page: 1 } } } });
    apiMock.post.mockResolvedValue({ data: { data: { changed: true } } });
    await inventoryApi.movements({ productId: 'p1', page: 2 });
    expect(apiMock.get).toHaveBeenCalledWith('/inventory/movements', { params: { productId: 'p1', page: 2 } });
    await inventoryApi.createMovement('p1', { movementType: 'MANUAL_ADD', quantity: 2, expectedBefore: 1, reason: 'Delivery' });
    expect(apiMock.post).toHaveBeenCalledWith('/products/p1/stock-movements', expect.objectContaining({ movementType: 'MANUAL_ADD', quantity: 2 }));
    await inventoryApi.verifyOpeningCount('p1', { verifiedCount: 0, reason: 'Counted empty shelf', accountPassword: 'secret' });
    expect(apiMock.post).toHaveBeenCalledWith('/products/p1/opening-count', expect.objectContaining({ verifiedCount: 0 }));
  });
});
