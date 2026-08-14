import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../types/product.types';
import { ProductPicker } from './ProductPicker';

const { productHooks } = vi.hoisted(() => ({ productHooks: { useProducts: vi.fn() } }));

vi.mock('../hooks/useProducts', () => ({
  useProducts: productHooks.useProducts,
  useCreateProduct: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../inventory/hooks/useInventory', () => ({
  useProductInventory: () => ({ data: { onboardingStatus: 'ONBOARDED' }, isLoading: false, isError: false }),
}));

const product = {
  id: 'product-after-first-100', name: 'Catalogue item after page 100', model: 'M-101', sku: 'HC-000101',
  barcode: '1234567890123', trackStock: true, stockQuantity: 7,
} as Product;

const renderPicker = () => renderToStaticMarkup(<ProductPicker selectedProductId={null} onSelect={() => undefined} />);

describe('shared product search picker', () => {
  beforeEach(() => productHooks.useProducts.mockReset());

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
});
