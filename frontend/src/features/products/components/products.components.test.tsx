import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { productFormSchema } from '../schemas/product.schemas';
import { Product } from '../types/product.types';
import { productKeys } from '../hooks/useProducts';
import { ProductLabel } from './ProductLabel';
import { ProductPicker } from './ProductPicker';
import { ProductsTable } from './ProductsTable';

const product: Product = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'مروحة سقف',
  model: 'CF-52',
  brand: 'Ariete',
  barcode: '8901643123456',
  price: '450.00',
  discount: '50.00',
  netPrice: '400.00',
  isActive: true,
  imageUrl: null,
  image: null,
  notes: 'منتج تجريبي',
  createdAt: '2026-07-29T10:00:00.000Z',
  updatedAt: '2026-07-29T10:00:00.000Z',
  pricing: {
    pricingAvailable: true, source: 'PRESET', pricingPresetId: '33333333-3333-4333-8333-333333333333',
    presetName: 'Standard AC', useCustomPricing: false, costPrice: '300.00', cashPrice: '377.82',
    installmentPrice: '453.38', downPayment: '181.35', remaining: '272.03', monthlyPayment: '90.67',
    lastInstallmentPayment: '90.69', installmentMonths: 3, warnings: [],
  },
};

describe('product management frontend', () => {
  it('accepts Arabic text and validates discount amounts using cents', () => {
    expect(productFormSchema.parse({ name: 'مروحة', model: 'F1', brand: 'العربية', barcode: '', price: '100.00', discount: '99.99', imageUrl: '', notes: 'ملاحظة' }).name).toBe('مروحة');
    expect(() => productFormSchema.parse({ name: 'Fan', model: 'F1', brand: '', barcode: '', price: '100.00', discount: '100.01', imageUrl: '', notes: '' })).toThrow('Discount');
  });

  it('renders Arabic-safe table values, status, prices, and actions', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ProductsTable products={[product]} selectedIds={new Set()} canAdmin onSelect={() => undefined} onSelectAll={() => undefined} onView={() => undefined} onEdit={() => undefined} onArchive={() => undefined} onRestore={() => undefined} /></MemoryRouter>);
    expect(html).toContain('مروحة سقف');
    expect(html).toContain('dir="auto"');
    expect(html).toContain('Active / نشط');
    expect(html).toContain('$450.00');
    expect(html).toContain('Standard AC');
    expect(html).toContain('$453.38');
    expect(html).toContain('View details / عرض التفاصيل');
    expect(html).toContain('Archive product');
  });

  it('renders the installment total with its down payment and monthly breakdown', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ProductsTable products={[product]} selectedIds={new Set()} canAdmin onSelect={() => undefined} onSelectAll={() => undefined} onView={() => undefined} onEdit={() => undefined} onArchive={() => undefined} onRestore={() => undefined} /></MemoryRouter>);
    expect(html).toContain('$453.38');
    expect(html).toContain('$181.35 + 3 × $90.67');
    expect(html).toContain('$300.00');
  });

  it('renders four-digit installment totals with thousands separators', () => {
    const large: Product = {
      ...product, price: null, discount: null, netPrice: null,
      pricing: {
        pricingAvailable: true, source: 'PRESET', pricingPresetId: '33333333-3333-4333-8333-333333333333',
        presetName: 'White', useCustomPricing: false, costPrice: '670.00', cashPrice: '844.00',
        installmentPrice: '1013.00', downPayment: '405.20', remaining: '607.80', monthlyPayment: '202.60',
        lastInstallmentPayment: '202.60', installmentMonths: 3, warnings: [],
      },
    };
    const html = renderToStaticMarkup(<MemoryRouter><ProductsTable products={[large]} selectedIds={new Set()} canAdmin onSelect={() => undefined} onSelectAll={() => undefined} onView={() => undefined} onEdit={() => undefined} onArchive={() => undefined} onRestore={() => undefined} /></MemoryRouter>);
    expect(html).toContain('$844.00');
    expect(html).toContain('$1,013.00');
    expect(html).toContain('$405.20 + 3 × $202.60');
  });

  it('does not crash when a cached pricing response contains cash price only', () => {
    const cachedProduct: Product = {
      ...product,
      pricing: {
        pricingAvailable: true, source: 'PRESET', pricingPresetId: '33333333-3333-4333-8333-333333333333',
        presetName: 'Standard AC', useCustomPricing: false, cashPrice: '377.82', warnings: [],
      },
    };
    const html = renderToStaticMarkup(<MemoryRouter><ProductsTable products={[cachedProduct]} selectedIds={new Set()} canAdmin onSelect={() => undefined} onSelectAll={() => undefined} onView={() => undefined} onEdit={() => undefined} onArchive={() => undefined} onRestore={() => undefined} /></MemoryRouter>);
    expect(html).toContain('$377.82');
    expect(html).toContain('View details / عرض التفاصيل');
  });

  it('renders an external product image URL directly in the table', () => {
    const withUrl: Product = {
      ...product,
      imageUrl: 'https://cdn.example.com/fan.png',
      image: { source: 'URL', url: 'https://cdn.example.com/fan.png' },
    };
    const html = renderToStaticMarkup(<MemoryRouter><ProductsTable products={[withUrl]} selectedIds={new Set()} canAdmin onSelect={() => undefined} onSelectAll={() => undefined} onView={() => undefined} onEdit={() => undefined} onArchive={() => undefined} onRestore={() => undefined} /></MemoryRouter>);
    expect(html).toContain('https://cdn.example.com/fan.png');
    expect(html).toContain('loading="lazy"');
  });

  it('shows a placeholder instead of an image request when a product has none', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ProductsTable products={[product]} selectedIds={new Set()} canAdmin onSelect={() => undefined} onSelectAll={() => undefined} onView={() => undefined} onEdit={() => undefined} onArchive={() => undefined} onRestore={() => undefined} /></MemoryRouter>);
    expect(html).not.toContain('<img');
    expect(html).toContain('مروحة سقف');
  });

  it('rejects image links that are not http(s) and accepts ones that are', () => {
    const base = { name: 'Fan', model: 'F1', brand: '', barcode: '', price: '', discount: '', notes: '' } as const;
    expect(productFormSchema.parse({ ...base, imageUrl: 'https://cdn.example.com/a.png' }).imageUrl).toBe('https://cdn.example.com/a.png');
    expect(productFormSchema.parse({ ...base, imageUrl: '' }).imageUrl).toBe('');
    expect(() => productFormSchema.parse({ ...base, imageUrl: 'javascript:alert(1)' })).toThrow('valid http');
    expect(() => productFormSchema.parse({ ...base, imageUrl: 'not a url' })).toThrow('valid http');
  });

  it('omits a missing barcode block from printable labels', () => {
    const html = renderToStaticMarkup(<ProductLabel product={{ id: product.id, name: product.name, model: product.model, brand: product.brand, barcode: null, price: product.price }} />);
    expect(html).toContain('مروحة سقف');
    expect(html).not.toContain('product-label-barcode');
  });

  it('shows barcode values in the active service product picker', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(productKeys.list({ search: '', isActive: true, pageSize: 10 }), {
      items: [product], pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    const html = renderToStaticMarkup(<QueryClientProvider client={queryClient}><ProductPicker value={{ productId: product.id, manualProductName: '', manualProductModel: '', manualProductBrand: '', manualProductNotes: '' }} onChange={() => undefined} /></QueryClientProvider>);
    expect(html).toContain('8901643123456');
    expect(html).toContain('Select Existing / اختيار منتج');
  });
});
