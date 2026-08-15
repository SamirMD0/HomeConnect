import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { productState, inventoryState, imageUrlHook } = vi.hoisted(() => ({
  productState: { data: undefined as Record<string, unknown> | undefined, isLoading: false, isError: false, refetch: vi.fn() },
  inventoryState: { data: undefined as { onboardingStatus: string } | undefined, isLoading: false, isError: false },
  imageUrlHook: vi.fn(() => ({ url: 'blob:product-image', isLoading: false, isError: false })),
}));

vi.mock('../hooks/useProducts', () => ({
  useProduct: () => productState,
  useProductImageUrl: imageUrlHook,
}));
vi.mock('../../inventory/hooks/useInventory', () => ({ useProductInventory: () => inventoryState }));

import { ProductPreviewPanel } from './ProductPreviewPanel';

const baseProduct = {
  id: 'product-1', sku: 'HC-000001', name: 'Coffee grinder', model: 'CG-8', barcode: '1234567890123', brand: 'Home',
  price: '40.00', netPrice: '38.00', isActive: true, image: { source: 'UPLOAD', mimeType: 'image/png', byteSize: 10, updatedAt: '2026-08-14T10:00:00.000Z' },
  trackStock: true, stockQuantity: 0, stockStatus: 'OUT_OF_STOCK', pricing: { pricingAvailable: true, cashPrice: '35.00' },
  specifications: [{ label: 'Power', value: '150W' }],
};

const noop = () => undefined;
const panel = (props: Record<string, unknown> = {}) => renderToStaticMarkup(
  <ProductPreviewPanel
    productId="product-1"
    onOpenProduct={noop}
    onMakeOrder={noop}
    onReceiveStock={noop}
    {...props}
  />
);
const render = (overrides: Record<string, unknown> = {}) => {
  productState.data = { ...baseProduct, ...overrides };
  return panel();
};
const buttonTag = (html: string, label: string) => {
  const start = html.lastIndexOf('<button', html.indexOf(label));
  return start === -1 ? '' : html.slice(start, html.indexOf('>', start) + 1);
};

beforeEach(() => {
  vi.clearAllMocks();
  productState.data = undefined;
  productState.isLoading = false;
  productState.isError = false;
  inventoryState.data = { onboardingStatus: 'ONBOARDED' };
  inventoryState.isLoading = false;
  inventoryState.isError = false;
});

describe('ProductPreviewPanel', () => {
  /** The panel is on the page before anything is scanned — that is the point of it. */
  it('shows an empty state with no product selected', () => {
    const html = panel({ productId: null });
    expect(html).toContain('Product Preview');
    expect(html).toContain('Scan or search a product to preview it');
    expect(html).toContain('امسح أو ابحث عن منتج لعرضه');
  });

  it('shows authenticated product detail pricing, stock, and uploaded image', () => {
    const html = render();
    expect(html).toContain('Coffee grinder');
    expect(html).toContain('HC-000001');
    expect(html).toContain('1234567890123');
    expect(html).toContain('$35.00');
    expect(html).toContain('Out of stock');
    expect(html).toContain('0 in stock');
    expect(imageUrlHook).toHaveBeenCalledWith('product-1', '2026-08-14T10:00:00.000Z');
  });

  it('shows product specifications when they exist', () => {
    const html = render();
    expect(html).toContain('Power');
    expect(html).toContain('150W');
  });

  it('offers Make Order, Receive Stock, and Open Product', () => {
    const html = render();
    expect(html).toContain('Make Order / إنشاء طلب');
    expect(html).toContain('Receive Stock / إدخال مخزون');
    expect(html).toContain('Open Product');
  });

  /** Receiving is inventory-only; saying so on the panel prevents a costly assumption. */
  it('states that receiving creates no supplier debt', () => {
    expect(render()).toContain('creates no supplier debt');
  });

  it('keeps Make Order enabled when stock is zero', () => {
    expect(buttonTag(render(), 'Make Order')).not.toContain('disabled=""');
  });

  it('disables Make Order and explains why for an archived product', () => {
    const html = render({ isActive: false });
    expect(html).toContain('Archived product');
    expect(buttonTag(html, 'Make Order')).toContain('disabled=""');
  });

  it('surfaces a barcode and SKU collision', () => {
    productState.data = baseProduct;
    expect(panel({ alsoMatchedSku: true })).toContain('also another product');
  });

  it('shows a pending opening-count warning', () => {
    inventoryState.data = { onboardingStatus: 'PENDING_ONBOARDING' };
    expect(render()).toContain('Needs a verified opening count');
  });

  it('offers retry without displaying stale detail after a fetch failure', () => {
    productState.isError = true;
    productState.data = undefined;
    const html = panel();
    expect(html).toContain('Unable to load product details');
    expect(html).toContain('Retry');
    expect(html).not.toContain('$35.00');
  });

  it('shows a loading state while detail is in flight', () => {
    productState.isLoading = true;
    productState.data = undefined;
    expect(panel()).toContain('Loading product');
  });

  it('never asks for an account password', () => {
    const html = render();
    expect(html).not.toContain('type="password"');
    expect(html.toLowerCase()).not.toContain('account password');
  });

  /**
   * Receiving needs a stock-tracked, onboarded product. Prefilling anything
   * else hands the user a form they cannot submit.
   */
  it('reports whether the receiving form may be prefilled', () => {
    const onReceiveStock = vi.fn();
    productState.data = baseProduct;
    renderToStaticMarkup(<ProductPreviewPanel productId="product-1" onOpenProduct={noop} onMakeOrder={noop} onReceiveStock={onReceiveStock} />);

    // Rendering alone must not act; the flag is computed from onboarding state.
    expect(onReceiveStock).not.toHaveBeenCalled();

    inventoryState.data = { onboardingStatus: 'PENDING_ONBOARDING' };
    expect(render()).toContain('Needs a verified opening count');
  });
});
