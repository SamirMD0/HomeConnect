import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Children, isValidElement, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../context/AuthContext';
import { productFormSchema, productPricingModeFormSchema } from '../schemas/product.schemas';
import { Product, ProductLabelData } from '../types/product.types';
import { productKeys } from '../hooks/useProducts';
import { MAX_LABEL_SELECTION } from '../utils/label-selection';
import { calculateLabelSheetLayout } from '../utils/label-sheet-layout';
import { ProductLabelSheetSettings } from '../utils/product-label-settings';
import { ProductBulkActionsBar } from './ProductBulkActionsBar';
import { barcodeFormat, ProductLabel } from './ProductLabel';
import { barcodeLayout } from '../utils/barcode-geometry';
import { LABEL_PRESETS } from '../utils/product-label-settings';
import { ProductLabelSheet } from './ProductLabelSheet';
import { ProductMobileCard } from './ProductMobileCard';
import { ProductPicker } from './ProductPicker';
import { ProductsTable } from './ProductsTable';
import { ProductCard } from './ProductCard';
import { ProductDetailsDrawer } from './ProductDetailsDrawer';
import { ProductFilters } from './ProductFilters';
import { ProductImageBroken } from './ProductImageView';
import { ProductOverflowMenu, ProductOverflowMenuItems } from './ProductOverflowMenu';
import { buildProductPricingConfigurationInput, CreatedTrackedProductToast, ProductFormDialog, shouldRemoveStagedProductImage, shouldUpdateProductPricing, toCreateInput } from './ProductFormDialog';
import { emptyProductFormPricing } from './ProductFormPricingPanel';
import { ProductStockSection } from './ProductStockSection';
import { productFocusSearchParams } from '../../../pages/products/ProductsPage';

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
    pricingAvailable: true, mode: 'PRESET', source: 'PRESET', pricingPresetId: '33333333-3333-4333-8333-333333333333', installmentEnabled: true,
    presetName: 'Standard AC', useCustomPricing: false, costPrice: '300.00', cashPrice: '377.82',
    installmentPrice: '453.38', downPayment: '181.35', remaining: '272.03', monthlyPayment: '90.67',
    lastInstallmentPayment: '90.69', installmentMonths: 3, warnings: [],
  },
};

interface TestProps {
  children?: ReactNode;
  'aria-label'?: string;
  label?: string;
  onClick?: () => void;
  onChange?: (event: { target: { checked: boolean } }) => void;
}

type TestElement = ReactElement<TestProps>;

/**
 * Flattens a rendered tree into the elements the interaction tests poke at.
 *
 * Function components are expanded by calling them, so extracting a block of
 * markup into its own presentational component (`ProductIdentity`) does not
 * hide the controls inside it from a test that only cares that clicking the
 * product name opens the drawer. Anything that needs React's hook dispatcher
 * cannot be called this way and is skipped — those components have their own
 * tests that render them properly.
 */
const testElements = (node: ReactNode): TestElement[] => {
  if (!isValidElement(node)) return [];
  const element = node as TestElement;
  return [element, ...expandComponent(element), ...Children.toArray(element.props.children).flatMap(testElements)];
};

const expandComponent = (element: TestElement): TestElement[] => {
  if (typeof element.type !== 'function') return [];
  try {
    return testElements((element.type as (props: TestProps) => ReactNode)(element.props));
  } catch {
    return [];
  }
};

const textOf = (node: ReactNode): string => Children.toArray(node).map((child) =>
  typeof child === 'string' || typeof child === 'number'
    ? String(child)
    : isValidElement(child) ? textOf((child as TestElement).props.children) : ''
).join('');

describe('product management frontend', () => {
  it('renders stock quantity as read-only settings context', () => {
    const html = renderToStaticMarkup(<ProductStockSection value={{ trackStock: true, stockQuantity: 4, lowStockThreshold: 2 }} onChange={() => undefined} />);
    expect(html).toContain('<output');
    expect(html).not.toContain('value="4"');
  });
  it('renders create-time stock controls without quantity and explains the opening-count guard', () => {
    const tracked = renderToStaticMarkup(<ProductStockSection mode="create" value={{ trackStock: true, stockQuantity: 0, lowStockThreshold: 2 }} onChange={() => undefined} />);
    const untracked = renderToStaticMarkup(<ProductStockSection mode="create" value={{ trackStock: false, stockQuantity: 0, lowStockThreshold: null }} onChange={() => undefined} />);
    expect(tracked).toContain('Track stock / تتبع المخزون');
    expect(tracked).toContain('Low-stock threshold / حد المخزون المنخفض');
    expect(tracked).not.toContain('Current quantity / الكمية الحالية');
    expect(tracked).toContain('The opening count must be verified before any stock action');
    expect(untracked).toContain('disabled=""');
    expect(untracked).not.toContain('The opening count must be verified before any stock action');
  });

  it('renders the stock section in the Add Product form', () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      <AuthContext.Provider value={{
        user: { id: 'employee-1', username: 'employee', fullName: 'Shop Employee', role: 'EMPLOYEE' },
        accessToken: 'token', isAuthenticated: true, isLoading: false,
        login: () => undefined, logout: async () => undefined, updateUser: () => undefined,
      }}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter><ProductFormDialog open product={null} onClose={() => undefined} onViewDuplicate={() => undefined} /></MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>
    );
    expect(html).toContain('Add Product / إضافة منتج');
    expect(html).toContain('Stock settings / إعدادات المخزون');
    expect(html).not.toContain('Current quantity / الكمية الحالية');
  });

  it('builds a quantity-free create payload and clears the threshold when tracking is off', () => {
    const values = { name: ' Fan ', model: ' F1 ', brand: '', barcode: '', price: '', discount: '', imageUrl: '', notes: '' };
    expect(toCreateInput(values, undefined, [], '', 'AUTO', { trackStock: true, stockQuantity: 99, lowStockThreshold: 2 }))
      .toMatchObject({ name: 'Fan', model: 'F1', trackStock: true, lowStockThreshold: 2 });
    expect(toCreateInput(values, undefined, [], '', 'AUTO', { trackStock: false, stockQuantity: 99, lowStockThreshold: 2 }))
      .toMatchObject({ trackStock: false, lowStockThreshold: null });
    expect(toCreateInput(values, undefined, [], '', 'AUTO', { trackStock: true, stockQuantity: 99, lowStockThreshold: 2 }))
      .not.toHaveProperty('stockQuantity');
  });

  it('offers the opening-count follow-through after creating a tracked product', () => {
    const html = renderToStaticMarkup(<CreatedTrackedProductToast onVerify={() => undefined} />);
    expect(html).toContain('Verify opening count now / تأكيد الجرد الافتتاحي الآن');
  });
  it('keeps the mobile product list card markup stable', () => {
    const html = renderToStaticMarkup(<MemoryRouter><ProductMobileCard product={product} selected={false} canAdmin onSelect={() => undefined} onView={() => undefined} onEdit={() => undefined} onArchive={() => undefined} onRestore={() => undefined} /></MemoryRouter>);
    expect(html).toMatchSnapshot();
  });

  it('keeps grid image, name, and selection as independent clickable targets', () => {
    const onView = vi.fn();
    const onSelect = vi.fn();
    const onInventory = vi.fn();
    const tree = ProductCard({ product, variant: 'grid', selected: false, canAdmin: true, onSelect, onView, onEdit: vi.fn(), onInventory, onArchive: vi.fn(), onRestore: vi.fn() }) as ReactElement;
    const controls = testElements(tree);
    const image = controls.find((element) => element.type === 'button' && String(element.props['aria-label']).startsWith('Open '));
    const name = controls.find((element) => element.type === 'button' && textOf(element.props.children) === product.name);
    const checkbox = controls.find((element) => element.type === 'input' && element.props['aria-label'] === `Select ${product.name}`);
    const inventory = controls.find((element) => element.props.label === 'Inventory / المخزون');
    image?.props.onClick?.();
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    name?.props.onClick?.();
    expect(onView).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
    checkbox?.props.onChange?.({ target: { checked: true } });
    expect(onView).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith(true);
    inventory?.props.onClick?.();
    expect(onInventory).toHaveBeenCalledTimes(1);
    expect(checkbox?.props.children).toBeUndefined();
    expect(renderToStaticMarkup(<MemoryRouter>{tree}</MemoryRouter>)).not.toContain('<label');
  });

  it('opens table thumbnail and name independently, and mobile repeats the same controls', () => {
    const tableView = vi.fn();
    const table = ProductsTable({ products: [product], selectedIds: new Set(), canAdmin: true, onSelect: vi.fn(), onSelectAll: vi.fn(), onView: tableView, onEdit: vi.fn(), onInventory: vi.fn(), onArchive: vi.fn(), onRestore: vi.fn() }) as ReactElement;
    const tableControls = testElements(table);
    tableControls.find((element) => element.type === 'button' && String(element.props['aria-label']).startsWith('Open '))?.props.onClick?.();
    tableControls.find((element) => element.type === 'button' && textOf(element.props.children) === product.name)?.props.onClick?.();
    expect(tableView).toHaveBeenCalledTimes(2);

    const mobileView = vi.fn();
    const mobile = ProductMobileCard({ product, selected: false, canAdmin: true, onSelect: vi.fn(), onView: mobileView, onEdit: vi.fn(), onInventory: vi.fn(), onArchive: vi.fn(), onRestore: vi.fn() }) as ReactElement<Parameters<typeof ProductCard>[0]>;
    const mobileControls = testElements(ProductCard(mobile.props) as ReactElement);
    mobileControls.find((element) => element.type === 'button' && String(element.props['aria-label']).startsWith('Open '))?.props.onClick?.();
    mobileControls.find((element) => element.type === 'button' && textOf(element.props.children) === product.name)?.props.onClick?.();
    expect(mobileView).toHaveBeenCalledTimes(2);
  });

  it('keeps secondary actions in a keyboard-reachable overflow with the shared Make Order URL', () => {
    const menu = renderToStaticMarkup(<MemoryRouter><ProductOverflowMenu product={product} canAdmin onArchive={() => undefined} onRestore={() => undefined} defaultOpen /></MemoryRouter>);
    expect(menu).toContain('aria-haspopup="menu"');
    expect(menu).toContain('aria-expanded="true"');
    expect(menu).toContain('role="menu"');
    expect(menu).toContain('role="menuitem"');
    expect(menu.match(/role="menuitem"/g)).toHaveLength(3);
    expect(menu).not.toContain('<div role="menuitem"');
    expect(menu).toContain(`/sales-orders?action=add&amp;productId=${product.id}`);
    expect(menu).toContain('Print label / طباعة الملصق');
    expect(menu).toContain('Make Order / إنشاء طلب');

    const archive = vi.fn();
    const items = testElements(ProductOverflowMenuItems({ product, canAdmin: true, onArchive: archive, onRestore: vi.fn() }) as ReactElement);
    items.find((element) => element.type === 'button' && textOf(element.props.children).includes('Archive'))?.props.onClick?.();
    expect(archive).toHaveBeenCalledTimes(1);

    const restore = vi.fn();
    const inactiveItems = testElements(ProductOverflowMenuItems({ product: { ...product, isActive: false }, canAdmin: true, onArchive: vi.fn(), onRestore: restore }) as ReactElement);
    inactiveItems.find((element) => element.type === 'button' && textOf(element.props.children).includes('Restore'))?.props.onClick?.();
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('anchors Inventory to Stock and shows stock truth in the drawer header', () => {
    expect(productFocusSearchParams(new URLSearchParams('search=fan&page=2'), product.id, 'stock').toString())
      .toContain(`focus=${product.id}&section=stock`);
    const queryClient = new QueryClient();
    queryClient.setQueryData(productKeys.detail(product.id), product);
    queryClient.setQueryData(productKeys.audit(product.id), []);
    queryClient.setQueryData(productKeys.serviceJobs(product.id, 1), { items: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } });
    queryClient.setQueryData(productKeys.pricing(product.id, undefined), product.pricing);
    const html = renderToStaticMarkup(<AuthContext.Provider value={{
      user: { id: 'admin-1', username: 'admin', fullName: 'Admin', role: 'ADMIN' }, accessToken: 'token', isAuthenticated: true, isLoading: false,
      login: () => undefined, logout: async () => undefined, updateUser: () => undefined,
    }}><QueryClientProvider client={queryClient}><MemoryRouter><ProductDetailsDrawer productId={product.id} initialSection="stock" onClose={() => undefined} onEdit={() => undefined} onArchive={() => undefined} onRestore={() => undefined} /></MemoryRouter></QueryClientProvider></AuthContext.Provider>);
    expect(html).toContain('In stock / متوفر');
    expect(html).toContain('4 units / وحدة');
    expect(html).toContain('Product sections / أقسام المنتج');
    expect(html).toContain('href="#product-stock"');
    expect(html).toContain('id="product-stock"');
  });

  it('labels the temporary brand text field honestly until CP-RW7', () => {
    const html = renderToStaticMarkup(<ProductFilters filters={{}} search="" onSearchChange={() => undefined} onChange={() => undefined} onSearchSubmit={() => undefined} onReset={() => undefined} searchInputRef={{ current: null }} />);
    expect(html).toContain('Filter by brand / تصفية حسب الماركة');
    expect(html).not.toContain('All Brands / كل الماركات');
  });

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
    expect(html).toContain('Inventory / المخزون');
    expect(html).toContain('More actions for مروحة سقف');
    expect(html).not.toContain('Archive product');
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
        pricingAvailable: true, mode: 'PRESET', source: 'PRESET', pricingPresetId: '33333333-3333-4333-8333-333333333333', installmentEnabled: true,
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
        pricingAvailable: true, mode: 'PRESET', source: 'PRESET', pricingPresetId: '33333333-3333-4333-8333-333333333333', installmentEnabled: false,
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

  it('validates manual mode and submits the pricing null pattern', () => {
    expect(productPricingModeFormSchema.safeParse({ mode: 'MANUAL', price: '', costPrice: '' }).success).toBe(false);
    expect(productPricingModeFormSchema.safeParse({ mode: 'MANUAL', price: '125.00', costPrice: '' }).success).toBe(true);
    expect(buildProductPricingConfigurationInput({ ...emptyProductFormPricing, mode: 'MANUAL' })).toEqual({
      costPrice: null, pricingPresetId: null, useCustomPricing: false, installmentEnabled: false,
      customExpensePercent: null, customProfitPercent: null, customDiscountBufferPercent: null,
      customInstallmentMarkupPercent: null, customDownPaymentPercent: null,
      customInstallmentMonths: null, customCalculationMode: null,
    });
  });

  it('never routes an employee notes edit through the pricing mutation', () => {
    const emptyPricing = buildProductPricingConfigurationInput(emptyProductFormPricing);
    expect(product.pricing?.installmentEnabled).toBe(true);
    expect(shouldUpdateProductPricing(false, product, emptyPricing)).toBe(false);
  });

  it('does not delete an uploaded image unless staged removal reaches submit', () => {
    const uploaded: Product = { ...product, image: { source: 'UPLOAD', mimeType: 'image/png', byteSize: 10, updatedAt: '2026-08-05T00:00:00Z' } };
    expect(shouldRemoveStagedProductImage(uploaded, false)).toBe(false);
    expect(shouldRemoveStagedProductImage(uploaded, true)).toBe(true);
  });

  it('renders grid cards with images, placeholders, and the broken-image tile', () => {
    const grid = (item: Product) => renderToStaticMarkup(<MemoryRouter><ProductCard product={item} variant="grid" selected={false} canAdmin onSelect={() => undefined} onView={() => undefined} onEdit={() => undefined} onArchive={() => undefined} onRestore={() => undefined} /></MemoryRouter>);
    expect(grid({ ...product, image: { source: 'URL', url: 'https://cdn.example.com/fan.png' } })).toContain('https://cdn.example.com/fan.png');
    expect(grid({ ...product, image: null })).toContain('lucide-package');
    expect(renderToStaticMarkup(<ProductImageBroken className="broken-tile" />)).toContain('Image could not be loaded / تعذر تحميل الصورة');
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

  it('prints the encoded value under every barcode, SKU and manufacturer alike', () => {
    for (const value of ['HC-000003', '6222048413923']) {
      const { options } = barcodeLayout(value, 68);
      expect(options.displayValue).toBe(true);
      // No caption override: the digits printed are exactly what is encoded.
      expect(options).not.toHaveProperty('text');
    }
  });

  it('labels the barcode with the encoded value and never the staff code', () => {
    const html = renderToStaticMarkup(<ProductLabel product={{ id: product.id, name: 'Coffee grinder', model: 'KA3083', brand: 'DSL', sku: 'HC-000003', barcodeValue: 'HC-000003', barcodeSource: 'SKU', internalPriceCode: 'P27', staffLabelCode: 'HC-000003-K27Z', cashPrice: '29.00' }} />);
    expect(html).toContain('aria-label="Barcode HC-000003"');
    expect(html).not.toMatch(/aria-label="[^"]*K27Z/);
  });

  it('shows the price on the Large preset and omits it on the Small preset', () => {
    const base = { id: product.id, name: 'Coffee grinder', model: 'KA3083', brand: 'DSL', sku: 'HC-000003', barcodeValue: 'HC-000003', barcodeSource: 'SKU' as const };
    const large = LABEL_PRESETS.LARGE;
    const small = LABEL_PRESETS.SMALL;
    // The server only sends cashPrice when the page asked for the price.
    const largeHtml = renderToStaticMarkup(<ProductLabel product={{ ...base, ...(large.showPrice ? { cashPrice: '29.00' } : {}) }} dimensions={{ widthMm: large.widthMm, heightMm: large.heightMm, autoFit: false }} />);
    const smallHtml = renderToStaticMarkup(<ProductLabel product={{ ...base, ...(small.showPrice ? { cashPrice: '29.00' } : {}) }} dimensions={{ widthMm: small.widthMm, heightMm: small.heightMm, autoFit: false }} />);
    expect(largeHtml).toContain('Price: $29');
    expect(smallHtml).not.toContain('Price');
    expect(smallHtml).toContain('product-label-barcode');
  });

  it('refuses to squeeze a barcode that cannot fit the label', () => {
    const value = 'X'.repeat(60);
    const html = renderToStaticMarkup(<ProductLabel product={{ id: product.id, name: 'Long code', model: 'M', brand: 'B', sku: 'HC-000009', barcodeValue: value, barcodeSource: 'MANUFACTURER' }} dimensions={{ widthMm: 58, heightMm: 40, autoFit: false }} />);
    expect(html).not.toContain('<svg');
    expect(html).toContain(value);
    expect(html).toContain('Barcode too long for this label');
  });

  it('selects native retail barcode formats and falls back to CODE128', () => {
    expect(barcodeFormat('6291041500213')).toBe('EAN13');
    expect(barcodeFormat('123456789012')).toBe('UPC');
    expect(barcodeFormat('12345670')).toBe('EAN8');
    expect(barcodeFormat('6291041500214')).toBe('CODE128');
    expect(barcodeFormat('HC-000001')).toBe('CODE128');
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
    queryClient.setQueryData(productKeys.list({ isActive: true, sortBy: 'name', sortOrder: 'asc', search: undefined, page: 1, pageSize: 10 }), {
      items: [product], pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    const html = renderToStaticMarkup(<QueryClientProvider client={queryClient}><ProductPicker value={{ productId: product.id, manualProductName: '', manualProductModel: '', manualProductBrand: '', manualProductNotes: '' }} onChange={() => undefined} /></QueryClientProvider>);
    expect(html).toContain('8901643123456');
    expect(html).toContain('Select Existing / اختيار منتج');
  });

  it('renders the shared server-search picker without a capped native select', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(productKeys.list({ isActive: true, sortBy: 'name', sortOrder: 'asc', search: undefined, page: 1, pageSize: 10 }), {
      items: [{ ...product, id: 'product-after-first-100', name: 'Catalogue item after page 100' }],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    const html = renderToStaticMarkup(<QueryClientProvider client={queryClient}><ProductPicker selectedProductId={null} onSelect={() => undefined} /></QueryClientProvider>);
    expect(html).toContain('Catalogue item after page 100');
    expect(html).toContain('Name, model, SKU or barcode');
    expect(html).not.toContain('<select');
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
