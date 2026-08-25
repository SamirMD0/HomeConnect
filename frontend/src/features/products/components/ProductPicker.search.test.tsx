import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../types/product.types';
import { ProductPicker } from './ProductPicker';

const { productHooks } = vi.hoisted(() => ({ productHooks: { useProducts: vi.fn(), useProduct: vi.fn() } }));

vi.mock('../hooks/useProducts', () => ({
  useProducts: productHooks.useProducts,
  useProduct: productHooks.useProduct,
  useCreateProduct: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../inventory/hooks/useInventory', () => ({
  useProductInventory: () => ({ data: { onboardingStatus: 'ONBOARDED' }, isLoading: false, isError: false }),
}));

const product = {
  id: 'product-after-first-100', name: 'Catalogue item after page 100', model: 'M-101', sku: 'HC-000101',
  barcode: '1234567890123', trackStock: true, stockQuantity: 7,
} as Product;

const renderPicker = (selectedProductId: string | null = null) => renderToStaticMarkup(<ProductPicker selectedProductId={selectedProductId} onSelect={() => undefined} />);

describe('shared product search picker', () => {
  beforeEach(() => {
    productHooks.useProducts.mockReset();
    productHooks.useProduct.mockReset();
    productHooks.useProduct.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
  });

  it('requests a small server-filterable page and renders a result as a selectable button', () => {
    productHooks.useProducts.mockReturnValue({ data: { items: [product] }, isLoading: false, isFetching: false, isError: false });
    const html = renderPicker();
    expect(productHooks.useProducts).toHaveBeenCalledWith(expect.objectContaining({ search: undefined, page: 1, pageSize: 10 }));
    expect(html).toContain('Catalogue item after page 100');
    expect(html).toContain('1234567890123');
    expect(html).toContain('<button');
    expect(html).not.toContain('<select');
  });

  it('renders an explicit empty state', () => {
    productHooks.useProducts.mockReturnValue({ data: { items: [] }, isLoading: false, isFetching: false, isError: false });
    expect(renderPicker()).toContain('No products match');
  });

  it('renders an inline error and retry action', () => {
    productHooks.useProducts.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, isError: true, refetch: vi.fn() });
    const html = renderPicker();
    expect(html).toContain('Unable to search products');
    expect(html).toContain('Retry / إعادة المحاولة');
  });

  it('hydrates a selected product that is absent from the current search page', () => {
    productHooks.useProducts.mockReturnValue({ data: { items: [] }, isLoading: false, isFetching: false, isError: false });
    productHooks.useProduct.mockReturnValue({ data: product, isLoading: false, isError: false, refetch: vi.fn() });
    const html = renderPicker(product.id);
    expect(productHooks.useProduct).toHaveBeenCalledWith(product.id);
    expect(html).toContain('Catalogue item after page 100');
    expect(html).toContain('border-brand-200');
  });

  it('shows explicit selected-product hydration loading and error states', () => {
    productHooks.useProducts.mockReturnValue({ data: { items: [] }, isLoading: false, isFetching: false, isError: false });
    productHooks.useProduct.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    expect(renderPicker(product.id)).toContain('Loading selected product… / جارٍ تحميل المنتج المحدد…');
    productHooks.useProduct.mockReturnValueOnce({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    const error = renderPicker(product.id);
    expect(error).toContain('Unable to load selected product / تعذر تحميل المنتج المحدد');
    expect(error).toContain('Retry / إعادة المحاولة');
  });
});
