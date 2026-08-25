import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Children, isValidElement, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../context/AuthContext';
import { inventoryKeys } from '../inventory/hooks/useInventory';
import { salesOrderCreateUrl } from '../sales-orders/utils/sales-order-links';
import { nextDialogFocusIndex } from '../../hooks/useDialogFocus';
import {
  hasActiveProductFilters,
  PRODUCT_SORT_OPTIONS,
  ProductFilters,
  ProductFiltersView,
  productFilterResetPatch,
  productSortPatch,
  productSortValue,
} from './components/ProductFilters';
import { ProductIdentity, ProductNotInInventoryChip } from './components/ProductIdentity';
import { ProductDetailsDrawer } from './components/ProductDetailsDrawer';
import {
  ProductFormDialog,
  ProductFormNotice,
  renderedProductFields,
} from './components/ProductFormDialog';
import { emptyProductFormPricing } from './components/ProductFormPricingPanel';
import { BrandCombobox } from './components/BrandCombobox';
import {
  ProductStats,
  productStockStatPatch,
  productTrackedStatPatch,
} from './components/ProductStats';
import { productKeys } from './hooks/useProducts';
import { Product, ProductFilters as ProductFilterValues } from './types/product.types';
import {
  ProductsEmptyState,
  ProductsErrorState,
  ProductsLoadingState,
  resolveProductPageSize,
} from '../../pages/products/ProductsPage';

interface TestProps {
  children?: ReactNode;
  'aria-label'?: string;
  'aria-controls'?: string;
  'aria-expanded'?: boolean;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
}

type TestElement = ReactElement<TestProps>;

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

const syncElement = (node: ReactNode | Promise<ReactNode>): ReactElement => node as ReactElement;

const product: Product = {
  id: '11111111-1111-4111-8111-111111111111',
  sku: 'HC-000001',
  name: 'Ceiling fan',
  model: 'CF-52',
  brand: 'General',
  barcode: '8901643123456',
  price: '450.00',
  discount: '50.00',
  netPrice: '400.00',
  isActive: true,
  imageUrl: null,
  image: null,
  notes: null,
  labelBarcodeSource: 'SKU',
  trackStock: true,
  stockQuantity: 4,
  lowStockThreshold: 2,
  stockStatus: 'IN_STOCK',
  specifications: [],
  specificationNotes: null,
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
  pricing: {
    pricingAvailable: false,
    mode: 'NONE',
    reason: 'No pricing configured',
    pricingPresetId: null,
    installmentEnabled: false,
    presetName: null,
    useCustomPricing: false,
  },
};

const employeeAuth = {
  user: { id: 'employee-1', username: 'employee', fullName: 'Shop Employee', role: 'EMPLOYEE' as const },
  accessToken: 'token',
  isAuthenticated: true,
  isLoading: false,
  login: () => undefined,
  logout: async () => undefined,
  updateUser: () => undefined,
};

const adminAuth = {
  ...employeeAuth,
  user: { id: 'admin-1', username: 'admin', fullName: 'Administrator', role: 'ADMIN' as const },
};

const renderWithData = (
  node: ReactNode,
  prepare?: (client: QueryClient) => void,
  auth: typeof employeeAuth | typeof adminAuth = employeeAuth
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  prepare?.(client);
  return renderToStaticMarkup(
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>
    </AuthContext.Provider>
  );
};

describe('product catalogue toolbar helpers', () => {
  it('detects every active filter while treating the explicit default sort as inactive', () => {
    expect(hasActiveProductFilters({}, '')).toBe(false);
    expect(hasActiveProductFilters({ sortBy: 'name', sortOrder: 'asc' }, '')).toBe(false);
    for (const [filters, search] of [
      [{}, 'fan'],
      [{ brand: 'General' }, ''],
      [{ hasBarcode: false }, ''],
      [{ trackStock: true }, ''],
      [{ stockStatus: 'LOW_STOCK' }, ''],
      [{ sortBy: 'stock' }, ''],
      [{ sortOrder: 'desc' }, ''],
    ] as Array<[ProductFilterValues, string]>) {
      expect(hasActiveProductFilters(filters, search)).toBe(true);
    }
  });

  it('resets only toolbar-owned keys', () => {
    const patch = productFilterResetPatch();
    expect(patch).toEqual({
      search: undefined,
      brand: undefined,
      hasBarcode: undefined,
      trackStock: undefined,
      stockStatus: undefined,
      sortBy: undefined,
      sortOrder: undefined,
      page: undefined,
    });
    expect(patch).not.toHaveProperty('isActive');
    expect(patch).not.toHaveProperty('view');
  });

  it('round-trips every sort and safely falls back to name ascending', () => {
    for (const option of PRODUCT_SORT_OPTIONS) {
      expect(productSortValue({ sortBy: option.sortBy, sortOrder: option.sortOrder })).toBe(option.value);
      expect(productSortPatch(option.value)).toEqual({ sortBy: option.sortBy, sortOrder: option.sortOrder, page: 1 });
    }
    expect(productSortValue({ sortBy: 'updatedAt', sortOrder: 'asc' })).toBe('name:asc');
    expect(productSortPatch('unknown')).toEqual({ sortBy: 'name', sortOrder: 'asc', page: 1 });
  });
});

describe('product catalogue toolbar rendering', () => {
  const view = (overrides: Partial<Parameters<typeof ProductFiltersView>[0]> = {}) => syncElement(ProductFiltersView({
    filters: {},
    search: '',
    onSearchChange: vi.fn(),
    onChange: vi.fn(),
    onSearchSubmit: vi.fn(),
    onReset: vi.fn(),
    searchInputRef: { current: null },
    advancedOpen: false,
    advancedId: 'advanced-products',
    onToggleAdvanced: vi.fn(),
    ...overrides,
  }));

  it('renders the core controls with accessible names and no competing autofocus', () => {
    const html = renderToStaticMarkup(view());
    expect(html).toContain('Search products / بحث عن المنتجات');
    expect(html).toContain('aria-label="Filter by brand / تصفية حسب الماركة"');
    expect(html).toContain('aria-label="Filter by stock status / تصفية حسب حالة المخزون"');
    expect(html).toContain('aria-label="Sort products / ترتيب المنتجات"');
    expect(html).not.toContain('autofocus');
  });

  it('shows clear, fetching, reset and result feedback only when applicable', () => {
    const onSearchChange = vi.fn();
    const onReset = vi.fn();
    const tree = view({ search: 'fan', isFetching: true, resultCount: 12, onSearchChange, onReset });
    const elements = testElements(tree);
    elements.find((element) => element.props['aria-label'] === 'Clear search / مسح البحث')?.props.onClick?.();
    elements.find((element) => element.props.onClick && textOf(element.props.children).includes('Reset filters'))?.props.onClick?.();
    expect(onSearchChange).toHaveBeenCalledWith('');
    expect(onReset).toHaveBeenCalledTimes(1);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('animate-spin');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('12 products');

    const idle = renderToStaticMarkup(view());
    expect(idle).not.toContain('Clear search / مسح البحث');
    expect(idle).not.toContain('animate-spin');
    expect(idle).not.toContain('Reset filters');
  });

  it('wires More filters and exposes every advanced select when open', () => {
    const onToggleAdvanced = vi.fn();
    const closed = view({ onToggleAdvanced });
    const toggle = testElements(closed).find((element) => element.props['aria-controls'] === 'advanced-products');
    expect(toggle?.props['aria-expanded']).toBe(false);
    toggle?.props.onClick?.();
    expect(onToggleAdvanced).toHaveBeenCalledTimes(1);

    const openHtml = renderToStaticMarkup(view({ advancedOpen: true }));
    expect(openHtml).toContain('id="advanced-products"');
    expect(openHtml).toContain('aria-label="Filter by barcode / تصفية حسب الباركود"');
    expect(openHtml).toContain('aria-label="Filter by stock tracking / تصفية حسب تتبع المخزون"');
    expect(openHtml).toContain('aria-label="Products per page / عدد المنتجات في الصفحة"');
  });

  it('starts advanced filters open when a hidden filter is already present', () => {
    const html = renderToStaticMarkup(<ProductFilters
      filters={{ hasBarcode: true }}
      search=""
      onSearchChange={() => undefined}
      onChange={() => undefined}
      onSearchSubmit={() => undefined}
      onReset={() => undefined}
      searchInputRef={{ current: null }}
    />);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Products per page / عدد المنتجات في الصفحة');
  });
});

describe('product catalogue stats and page states', () => {
  it('builds toggle patches that clear the competing stock filter and return to page one', () => {
    expect(productStockStatPatch({ stockStatus: 'LOW_STOCK', trackStock: true, page: 4 }, 'LOW_STOCK'))
      .toEqual({ stockStatus: undefined, trackStock: undefined, page: 1 });
    expect(productStockStatPatch({}, 'OUT_OF_STOCK'))
      .toEqual({ stockStatus: 'OUT_OF_STOCK', trackStock: undefined, page: 1 });
    expect(productTrackedStatPatch({ trackStock: true, stockStatus: 'LOW_STOCK', page: 4 }))
      .toEqual({ trackStock: undefined, stockStatus: undefined, page: 1 });
    expect(productTrackedStatPatch({ stockStatus: 'LOW_STOCK' }))
      .toEqual({ trackStock: true, stockStatus: undefined, page: 1 });
  });

  it('marks the applied stat as pressed and keeps Showing non-interactive', () => {
    const html = renderWithData(<ProductStats totalMatching={7} filters={{ stockStatus: 'LOW_STOCK' }} onFilter={() => undefined} />, (client) => {
      client.setQueryData(inventoryKeys.summary(), {
        trackedProducts: 20,
        lowStockProducts: 3,
        outOfStockProducts: 1,
        totalUnits: 60,
        movementsToday: 0,
        ordersAwaitingStockDeduction: 0,
        recentMovements: [],
      });
    });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toMatch(/<div[^>]*>[^]*Showing/);
    expect(html).not.toMatch(/<button[^>]*>[^]*Showing/);
  });

  it('renders stat skeletons while the inventory summary is loading', () => {
    const html = renderWithData(<ProductStats filters={{}} onFilter={() => undefined} />);
    expect(html).toContain('animate-pulse');
  });

  it.each([
    ['25', 25], ['50', 50], ['100', 100], [null, 25], ['', 25], ['7', 25], ['999', 25], ['abc', 25],
  ])('normalizes page size %s to %i', (raw, expected) => {
    expect(resolveProductPageSize(raw)).toBe(expected);
  });

  it('renders distinct filtered, empty-catalogue, and empty-archive actions', () => {
    const reset = vi.fn();
    const add = vi.fn();
    const filtered = syncElement(ProductsEmptyState({ filtersActive: true, archived: false, onReset: reset, onAdd: add }));
    const filteredButton = testElements(filtered).find((element) => element.props.onClick && textOf(element.props.children).includes('Reset filters'));
    filteredButton?.props.onClick?.();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(filtered)).toContain('No products match these filters');

    const active = syncElement(ProductsEmptyState({ filtersActive: false, archived: false, onReset: reset, onAdd: add }));
    testElements(active).find((element) => element.props.onClick && textOf(element.props.children).includes('Add Product'))?.props.onClick?.();
    expect(add).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(active)).toContain('No products yet');

    const archived = renderToStaticMarkup(syncElement(ProductsEmptyState({ filtersActive: false, archived: true, onReset: reset, onAdd: add })));
    expect(archived).toContain('Nothing archived');
    expect(archived).not.toContain('<button');
  });

  it('uses the matching table/grid skeleton and an actionable alert state', () => {
    expect(renderToStaticMarkup(<ProductsLoadingState view="table" />)).toContain('Loading products / جارٍ تحميل المنتجات');
    expect(renderToStaticMarkup(<ProductsLoadingState view="grid" />)).toContain('Loading product grid / جارٍ تحميل شبكة المنتجات');
    const retry = vi.fn();
    const error = syncElement(ProductsErrorState({ onRetry: retry }));
    expect(renderToStaticMarkup(error)).toContain('role="alert"');
    testElements(error).find((element) => element.props.onClick && textOf(element.props.children).includes('Try again'))?.props.onClick?.();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('product identity and inventory catalogue state', () => {
  it('keeps brand, name, model and code identity distinct and clickable', () => {
    const onView = vi.fn();
    const tree = syncElement(ProductIdentity({ product, onView }));
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('uppercase');
    expect(html.indexOf(product.brand ?? '')).toBeLessThan(html.indexOf(product.name));
    expect(html.indexOf(product.name)).toBeLessThan(html.indexOf(product.model));
    expect(html).toContain(`${product.sku}</span><span class="text-slate-400"> · ${product.barcode}`);
    testElements(tree).find((element) => element.type === 'button')?.props.onClick?.();
    expect(onView).toHaveBeenCalledTimes(1);

    const withoutOptional = renderToStaticMarkup(<ProductIdentity product={{ ...product, brand: null, barcode: null }} onView={() => undefined} />);
    expect(withoutOptional).not.toContain('uppercase');
    expect(withoutOptional).not.toContain(' · ');
  });

  it('shows the not-in-inventory chip only for an explicit true value', () => {
    expect(renderToStaticMarkup(<ProductNotInInventoryChip product={{ ...product, notInInventory: true }} />)).toContain('Not in inventory');
    expect(renderToStaticMarkup(<ProductNotInInventoryChip product={{ ...product, notInInventory: false }} />)).toBe('');
    expect(renderToStaticMarkup(<ProductNotInInventoryChip product={product} />)).toBe('');
  });
});

describe('product drawer, form, brands, and focus', () => {
  const renderDrawer = (item: Product) => renderWithData(
    <ProductDetailsDrawer
      productId={item.id}
      onClose={() => undefined}
      onEdit={() => undefined}
      onArchive={() => undefined}
      onRestore={() => undefined}
    />,
    (client) => {
      client.setQueryData(productKeys.detail(item.id), item);
      client.setQueryData(productKeys.audit(item.id), []);
      client.setQueryData(productKeys.serviceJobs(item.id, 1), { items: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } });
      client.setQueryData(productKeys.pricing(item.id, undefined), item.pricing);
    }
  );

  it('keeps the shared Make Order URL and shows both stock settings', () => {
    const html = renderDrawer(product);
    expect(html).toContain(`href="${salesOrderCreateUrl(product.id).replaceAll('&', '&amp;')}"`);
    expect(html).toContain('Stock tracking / تتبع المخزون');
    expect(html).toContain('Tracked / متتبع');
    expect(html).toContain('Low-stock threshold / حد المخزون المنخفض');
    expect(html).toContain('>2</dd>');
    expect(html).toContain('id="product-stock"');
  });

  it('shows explicit missing identity and image states and hides an irrelevant threshold', () => {
    const html = renderDrawer({ ...product, model: '', brand: null, barcode: null, trackStock: false, lowStockThreshold: null });
    expect(html).toContain('No model / لا يوجد موديل');
    expect(html).toContain('No brand / لا توجد ماركة');
    expect(html).toContain('No barcode / لا يوجد باركود');
    expect(html).toContain('border-dashed');
    expect(html).toContain('lucide-package');
    expect(html).toContain('Low-stock threshold / حد المخزون المنخفض');
    expect(html).toContain('>—</dd>');
    expect(html).toContain('lg:max-w-2xl xl:max-w-3xl');
    expect(html).not.toContain('aria-label="Close product details"');
  });

  it('links a selected spelling group to Brands only when duplicates exist', () => {
    const renderBrand = (spellings: string[]) => renderWithData(
      <BrandCombobox label="Brand" value="General" onChange={() => undefined} />,
      (client) => client.setQueryData(productKeys.brands(), [{
        canonical: 'General',
        productCount: 3,
        spellings,
        spellingCounts: spellings.map((spelling) => ({ spelling, productCount: 1 })),
      }])
    );
    expect(renderBrand(['General', 'GENERAL'])).toContain('href="/products/brands"');
    expect(renderBrand(['General', 'GENERAL'])).toContain('This brand has 2 spellings');
    expect(renderBrand(['General'])).not.toContain('href="/products/brands"');
  });

  it('renders form sections in workflow order with accessible required fields', () => {
    const html = renderWithData(
      <ProductFormDialog open product={null} onClose={() => undefined} onViewDuplicate={() => undefined} />,
      (client) => client.setQueryData(productKeys.brands(), [])
    );
    const headings = [
      'Product identity / هوية المنتج',
      'Inventory / المخزون',
      'Image / الصورة',
      'Specifications / المواصفات',
    ];
    for (let index = 1; index < headings.length; index += 1) {
      expect(html.indexOf(headings[index - 1])).toBeLessThan(html.indexOf(headings[index]));
    }
    expect(html.match(/aria-required="true"/g)).toHaveLength(2);
    const barcodeStart = html.indexOf('Barcode / الباركود');
    expect(html.slice(barcodeStart, barcodeStart + 900)).toContain('dir="ltr"');
    expect(html.slice(barcodeStart, barcodeStart + 900)).not.toContain('user-text-input');

    const adminHtml = renderWithData(
      <ProductFormDialog open product={null} onClose={() => undefined} onViewDuplicate={() => undefined} />,
      (client) => client.setQueryData(productKeys.brands(), []),
      adminAuth
    );
    expect(adminHtml).toContain('Pricing / التسعير');
    expect(adminHtml.indexOf('Specifications / المواصفات')).toBeLessThan(adminHtml.indexOf('Pricing / التسعير'));
  });

  it('keeps hidden-error field tracking aligned with pricing correction visibility', () => {
    expect(renderedProductFields(false, emptyProductFormPricing)).toContain('notes');
    expect(renderedProductFields(false, emptyProductFormPricing)).not.toContain('price');
    expect(renderedProductFields(true, emptyProductFormPricing)).not.toContain('reason');
    const correctionFields = renderedProductFields(true, emptyProductFormPricing, true);
    expect(correctionFields).toContain('reason');
    expect(correctionFields).toContain('accountPassword');
  });

  it('renders no-change feedback as a neutral status rather than an error alert', () => {
    const html = renderToStaticMarkup(<ProductFormNotice>No product changes were entered</ProductFormNotice>);
    expect(html).toContain('role="status"');
    expect(html).toContain('border-slate-200');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('red-');
  });

  it('explains the opening-count consequence only in edit mode', async () => {
    const { ProductStockSection } = await import('./components/ProductStockSection');
    const value = { trackStock: false, stockQuantity: 0, lowStockThreshold: null };
    const edit = renderToStaticMarkup(<ProductStockSection mode="edit" value={value} onChange={() => undefined} />);
    const create = renderToStaticMarkup(<ProductStockSection mode="create" value={value} onChange={() => undefined} />);
    expect(edit).toContain('Switching tracking on requires a verified opening count');
    expect(create).not.toContain('Switching tracking on requires a verified opening count');
  });

  it('wraps focus at the dialog edges without replacing normal browser Tab movement', () => {
    expect(nextDialogFocusIndex({ count: 3, activeIndex: 2, shiftKey: false, activeInsidePanel: true })).toBe(0);
    expect(nextDialogFocusIndex({ count: 3, activeIndex: 0, shiftKey: true, activeInsidePanel: true })).toBe(2);
    expect(nextDialogFocusIndex({ count: 3, activeIndex: 1, shiftKey: false, activeInsidePanel: true })).toBeNull();
    expect(nextDialogFocusIndex({ count: 3, activeIndex: -1, shiftKey: false, activeInsidePanel: false })).toBe(0);
    expect(nextDialogFocusIndex({ count: 3, activeIndex: -1, shiftKey: true, activeInsidePanel: false })).toBe(0);
    expect(nextDialogFocusIndex({ count: 0, activeIndex: -1, shiftKey: false, activeInsidePanel: false })).toBeNull();
  });
});
