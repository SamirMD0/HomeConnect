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

import { ProductPreviewModal } from './ProductPreviewModal';

const baseProduct = {
  id: 'product-1', sku: 'HC-000001', name: 'Coffee grinder', model: 'CG-8', barcode: '1234567890123', brand: 'Home',
  price: '40.00', netPrice: '38.00', isActive: true, image: { source: 'UPLOAD', mimeType: 'image/png', byteSize: 10, updatedAt: '2026-08-14T10:00:00.000Z' },
  trackStock: true, stockQuantity: 0, stockStatus: 'OUT_OF_STOCK', pricing: { pricingAvailable: true, cashPrice: '35.00' },
};

const render = (overrides: Record<string, unknown> = {}) => {
  productState.data = { ...baseProduct, ...overrides };
  return renderToStaticMarkup(
    <ProductPreviewModal productId="product-1" onClose={() => undefined} onOpenProduct={() => undefined} onMakeOrder={() => undefined} />
  );
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

describe('ProductPreviewModal', () => {
  it('shows authenticated product detail pricing, stock, and uploaded image', () => {
    const html = render();
    expect(html).toContain('Coffee grinder');
    expect(html).toContain('$35.00');
    expect(html).toContain('Out of stock');
    expect(html).toContain('0 in stock');
    expect(imageUrlHook).toHaveBeenCalledWith('product-1', '2026-08-14T10:00:00.000Z');
  });

  it('keeps Make Order enabled when stock is zero', () => {
    const html = render();
    const actionStart = html.lastIndexOf('<button', html.indexOf('Make Order'));
    const actionTag = html.slice(actionStart, html.indexOf('>', actionStart) + 1);
    expect(actionStart).toBeGreaterThan(-1);
    expect(actionTag).not.toContain('disabled=""');
  });

  it('disables Make Order and explains why for an archived product', () => {
    const html = render({ isActive: false });
    expect(html).toContain('Archived product');
    const actionStart = html.lastIndexOf('<button', html.indexOf('Make Order'));
    expect(html.slice(actionStart, html.indexOf('>', actionStart) + 1)).toContain('disabled=""');
  });

  it('surfaces a barcode and SKU collision', () => {
    productState.data = baseProduct;
    const html = renderToStaticMarkup(
      <ProductPreviewModal productId="product-1" alsoMatchedSku onClose={() => undefined} onOpenProduct={() => undefined} onMakeOrder={() => undefined} />
    );
    expect(html).toContain('also another product');
  });

  it('shows a pending opening-count warning', () => {
    inventoryState.data = { onboardingStatus: 'PENDING_ONBOARDING' };
    expect(render()).toContain('Needs a verified opening count');
  });

  it('offers retry without displaying stale detail after a fetch failure', () => {
    productState.isError = true;
    productState.data = undefined;
    const html = renderToStaticMarkup(
      <ProductPreviewModal productId="product-1" onClose={() => undefined} onOpenProduct={() => undefined} onMakeOrder={() => undefined} />
    );
    expect(html).toContain('Unable to load product details');
    expect(html).toContain('Retry');
    expect(html).not.toContain('$35.00');
  });
});
