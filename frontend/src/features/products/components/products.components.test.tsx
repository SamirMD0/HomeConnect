import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { productFormSchema } from '../schemas/product.schemas';
import { Product, ProductLabelData } from '../types/product.types';
import { productKeys } from '../hooks/useProducts';
import { MAX_LABEL_SELECTION } from '../utils/label-selection';
import { calculateLabelSheetLayout } from '../utils/label-sheet-layout';
import { ProductLabelSheetSettings } from '../utils/product-label-settings';
import { ProductBulkActionsBar } from './ProductBulkActionsBar';
import { barcodeOptions, ProductLabel } from './ProductLabel';
import { ProductLabelSheet } from './ProductLabelSheet';
import { ProductPicker } from './ProductPicker';
import { ProductsTable } from './ProductsTable';

const product: Product = {
  id: '11111111-1111-4111-8111-111111111111',
  sku: 'HC-000001',
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
  labelBarcodeSource: 'SKU', trackStock: true, stockQuantity: 4, lowStockThreshold: 2,
  stockStatus: 'IN_STOCK', specifications: [{ label: 'Capacity', value: '52 in' }], specificationNotes: null,
  createdAt: '2026-07-29T10:00:00.000Z',
  updatedAt: '2026-07-29T10:00:00.000Z',
  pricing: {
    pricingAvailable: true, source: 'PRESET', pricingPresetId: '33333333-3333-4333-8333-333333333333', installmentEnabled: true,
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
        pricingAvailable: true, source: 'PRESET', pricingPresetId: '33333333-3333-4333-8333-333333333333', installmentEnabled: true,
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
        pricingAvailable: true, source: 'PRESET', pricingPresetId: '33333333-3333-4333-8333-333333333333', installmentEnabled: false,
        presetName: 'Standard AC', useCustomPricing: false, cashPrice: '377.82', warnings: [],
      },
    };
    const html = renderToStaticMarkup(<MemoryRouter><ProductsTable products={[cachedProduct]} selectedIds={new Set()} canAdmin onSelect={() => undefined} onSelectAll={() => undefined} onView={() => undefined} onEdit={() => undefined} onArchive={() => undefined} onRestore={() => undefined} /></MemoryRouter>);
    expect(html).toContain('$377.82');
    expect(html).toContain('No installment preview / لا توجد معاينة تقسيط');
    expect(html).not.toContain('$453.38');
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

  it('prints SKU identity without exposing direction attributes', () => {
    const html = renderToStaticMarkup(<ProductLabel product={{ id: product.id, name: product.name, model: product.model, brand: product.brand, sku: product.sku, barcodeValue: product.sku, barcodeSource: 'SKU', internalPriceCode: null }} />);
    expect(html).toContain('مروحة سقف');
    expect(html).toContain('SKU: HC-000001');
    expect(html).not.toContain('dir=');
  });

  it('prints the staff code under the SKU caption and never labels it "Staff"', () => {
    const html = renderToStaticMarkup(<ProductLabel product={{ id: product.id, name: 'Coffee grinder', model: 'KA3083', brand: 'DSL', sku: 'HC-000003', barcodeValue: 'HC-000003', barcodeSource: 'SKU', internalPriceCode: 'P27', staffLabelCode: 'HC-000003-K27Z', cashPrice: '29.00' }} />);
    expect(html).toContain('SKU: HC-000003-K27Z');
    expect(html).not.toContain('Staff');
    expect(html).not.toContain('SKU: HC-000003<');
  });

  it('falls back to the plain SKU when no staff code is available', () => {
    const html = renderToStaticMarkup(<ProductLabel product={{ id: product.id, name: 'Coffee grinder', model: 'KA3083', brand: 'DSL', sku: 'HC-000003', barcodeValue: 'HC-000003', barcodeSource: 'SKU', internalPriceCode: null, staffLabelCode: null, cashPrice: '29.00' }} />);
    expect(html).toContain('SKU: HC-000003');
    expect(html).not.toContain('Staff');
  });

  it('prints the selling price above the barcode', () => {
    const html = renderToStaticMarkup(<ProductLabel product={{ id: product.id, name: 'Coffee grinder', model: 'KA3083', brand: 'DSL', sku: 'HC-000003', barcodeValue: 'HC-000003', barcodeSource: 'SKU', internalPriceCode: null, staffLabelCode: null, cashPrice: '29.00' }} />);
    expect(html).toContain('Price: $29');
    expect(html.indexOf('Price: $29')).toBeLessThan(html.indexOf('product-label-barcode'));
  });

  it('prints the digits under a manufacturer barcode but never under a HomeConnect SKU', () => {
    // The bars encode the value either way, so scanning is unaffected; only the
    // human-readable caption differs.
    expect(barcodeOptions('MANUFACTURER').displayValue).toBe(true);
    expect(barcodeOptions('SKU').displayValue).toBe(false);
  });

  it('omits the price row entirely when no price was requested', () => {
    const html = renderToStaticMarkup(<ProductLabel product={{ id: product.id, name: 'Coffee grinder', model: 'KA3083', brand: 'DSL', sku: 'HC-000003', barcodeValue: 'HC-000003', barcodeSource: 'SKU' }} />);
    expect(html).not.toContain('Price');
  });

  it('rounds label prices to whole dollars using half-up rules', async () => {
    const { formatLabelPrice } = await import('./ProductLabel');
    expect(formatLabelPrice('15.13')).toBe('$15');
    expect(formatLabelPrice('15.49')).toBe('$15');
    expect(formatLabelPrice('15.50')).toBe('$16');
    expect(formatLabelPrice('15.99')).toBe('$16');
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

const sheetSettings: ProductLabelSheetSettings = {
  mode: 'SHEET', paper: 'A4', labelWidthMm: 50, labelHeightMm: 30,
  pageMarginMm: 8, labelGapMm: 3, columns: 'AUTO', showCutGuides: true,
};

const labelOf = (index: number): ProductLabelData => ({
  id: `label-${index}`,
  name: `Product ${index}`,
  model: `M-${index}`,
  brand: 'Ariete',
  sku: `HC-${String(index).padStart(6, '0')}`,
  barcodeValue: `HC-${String(index).padStart(6, '0')}`,
  barcodeSource: 'SKU',
  cashPrice: `${100 + index}.00`,
});

const renderSheet = (labels: ProductLabelData[], settings = sheetSettings) =>
  renderToStaticMarkup(
    <ProductLabelSheet labels={labels} settings={settings} layout={calculateLabelSheetLayout(settings, labels.length)} />
  );

describe('bulk label sheet', () => {
  it('breaks labels onto as many pages as the sheet layout needs', () => {
    const onePage = renderSheet(Array.from({ length: 24 }, (_, index) => labelOf(index)));
    const twoPages = renderSheet(Array.from({ length: 25 }, (_, index) => labelOf(index)));

    expect(countPages(onePage)).toBe(1);
    expect(countPages(twoPages)).toBe(2);
  });

  it('renders every selected label exactly once across the pages', () => {
    const html = renderSheet(Array.from({ length: 25 }, (_, index) => labelOf(index)));

    expect(occurrences(html, 'SKU: HC-000000')).toBe(1);
    expect(occurrences(html, 'SKU: HC-000024')).toBe(1);
  });

  it('prints identity, the SKU caption, and the selling price, but no internal figures', () => {
    const html = renderSheet([labelOf(1)]);

    expect(html).toContain('Product 1');
    expect(html).toContain('Model: <span>M-1</span>');
    expect(html).toContain('Ariete');
    expect(html).toContain('SKU: HC-000001');
    expect(html).toContain('Price: $101');
    for (const forbidden of ['Cost', 'Installment', 'Supplier']) expect(html).not.toContain(forbidden);
  });

  it('applies the paper geometry in millimetres so the preview matches the print', () => {
    const html = renderSheet([labelOf(1)]);

    expect(html).toContain('--paper-width:210mm');
    expect(html).toContain('--paper-height:297mm');
    expect(html).toContain('--page-margin:8mm');
    expect(html).toContain('--label-columns:3');
  });

  it('applies cut guides only when they are switched on', () => {
    expect(renderSheet([labelOf(1)])).toContain('product-label-guides');
    expect(renderSheet([labelOf(1)], { ...sheetSettings, showCutGuides: false })).not.toContain('product-label-guides');
  });

  it('renders a flat list with no page geometry in sticker mode', () => {
    const html = renderSheet([labelOf(1)], { ...sheetSettings, mode: 'STICKER' });

    expect(countPages(html)).toBe(0);
    expect(html).toContain('SKU: HC-000001');
  });

  it('renders nothing when the label cannot fit the paper', () => {
    expect(renderSheet([labelOf(1)], { ...sheetSettings, labelWidthMm: 240 })).toBe('');
  });
});

describe('product bulk actions bar', () => {
  const bar = (selectedIds: string[], visibleIds: string[] = selectedIds) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <ProductBulkActionsBar selectedIds={selectedIds} visibleIds={visibleIds} onClear={() => undefined} />
      </MemoryRouter>
    );

  it('stays hidden until something is selected', () => {
    expect(bar([])).toBe('');
  });

  it('shows the count and links the selection to the label sheet', () => {
    const html = bar(['a', 'b']);

    expect(html).toContain('2 selected');
    expect(html).toContain('Print Labels (2)');
    expect(html).toContain('/products/labels?ids=a%2Cb');
  });

  it('says when the selection reaches beyond the page in view', () => {
    expect(bar(['a', 'b'], ['a'])).toContain('including 1 from other pages');
    expect(bar(['a', 'b'])).not.toContain('from other pages');
  });

  it('warns instead of silently truncating an oversized selection', () => {
    const html = bar(Array.from({ length: 137 }, (_, index) => `id-${index}`));

    expect(html).toContain(`Only the first ${MAX_LABEL_SELECTION} of 137`);
    expect(html).toContain(`Print Labels (${MAX_LABEL_SELECTION})`);
  });
});

const countPages = (html: string) => occurrences(html, 'class="label-page"');
const occurrences = (html: string, needle: string) => html.split(needle).length - 1;
