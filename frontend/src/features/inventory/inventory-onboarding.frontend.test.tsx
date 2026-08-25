import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryOnboardingOutcome, InventoryOnboardingPreview } from './components/InventoryOnboardingPreview';
import { inventoryApi } from './api/inventory.api';
import type { OnboardingWorklistItem } from './types/inventory.types';
import {
  addOnboardingSelection,
  buildOnboardingItems,
  onboardingItemsSignature,
  onboardingPreviewMatches,
  onboardingSelectionCounts,
  setAllOnboardingCountsToZero,
  updateOnboardingSelection,
  validateOnboardingSelection,
} from './utils/onboarding-batch';
import { InventoryOnboardingPage, messageFrom } from '../../pages/inventory/InventoryOnboardingPage';
import { InventoryPage, inventoryProductFiltersFor } from '../../pages/inventory/InventoryPage';

const { apiMock, mutation, capturedProductFilters } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn() },
  mutation: vi.fn(),
  capturedProductFilters: [] as unknown[],
}));

vi.mock('../../services/api', () => ({ api: apiMock }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'ADMIN' } }) }));
vi.mock('./hooks/useInventory', () => ({
  usePendingOnboarding: () => ({
    data: { items: [product(1), product(2)], pagination: { page: 1, pageSize: 50, totalItems: 309, totalPages: 7 } },
    isLoading: false,
    isError: false,
  }),
  useBatchOnboarding: () => ({ mutateAsync: mutation, isPending: false }),
  useInventorySummary: () => ({ data: { trackedProducts: 96, lowStockProducts: 2, outOfStockProducts: 1, movementsToday: 3, recentMovements: [] }, isLoading: false }),
  useLowStockProducts: () => ({ data: { items: [], pagination: { page: 1, pageSize: 25, totalItems: 3, totalPages: 1 } } }),
}));
vi.mock('../products/hooks/useProducts', () => ({
  useProducts: (filters: unknown) => {
    capturedProductFilters.push(filters);
    return { data: { items: [], pagination: { page: 1, pageSize: 25, totalItems: 308, totalPages: 13 } } };
  },
}));
vi.mock('../scanner/hooks/useScannerLookup', () => ({ useScannerLookup: () => ({ submit: vi.fn(), clear: vi.fn(), result: null, isLooking: false, isError: false }) }));
vi.mock('../scanner/hooks/useScannerEvents', () => ({ useScannerEvents: vi.fn() }));
vi.mock('./components/InventoryProductDrawer', () => ({ InventoryProductDrawer: () => null }));

function product(index: number): OnboardingWorklistItem {
  return {
    productId: `0000000${index}-1111-4111-8111-111111111111`,
    sku: `HC-${index}`,
    name: index === 1 ? 'Kozano Fan' : `Product ${index}`,
    model: `M${index}`,
    brand: index === 1 ? 'Kozano' : null,
    barcode: null,
    trackStock: false,
    stockQuantity: 0,
    status: 'NOT_IN_INVENTORY',
  };
}

describe('inventory onboarding frontend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProductFilters.length = 0;
  });

  it('renders the server-paginated searchable worklist with blank opening counts and no submit credentials', () => {
    const html = renderToStaticMarkup(<MemoryRouter><InventoryOnboardingPage /></MemoryRouter>);
    expect(html).toContain('Inventory Onboarding / إدراج المنتجات في المخزون');
    expect(html).toContain('Kozano Fan');
    expect(html).toContain('Search onboarding products');
    expect(html).toContain('Page <span class="font-semibold">1</span> of <span class="font-semibold">7</span>');
    expect(html).toContain('value=""');
    expect(html).not.toContain('Admin account password');
    expect(html).not.toContain('Submit 1 products');
  });

  it('keeps selection and counts by product id across changing result sets', () => {
    let selection = new Map();
    selection = addOnboardingSelection(selection, product(1)).selection;
    selection = updateOnboardingSelection(selection, product(1).productId, { count: 6 });
    selection = addOnboardingSelection(selection, product(2)).selection;
    expect(selection.get(product(1).productId)).toMatchObject({ count: 6 });
    expect(selection.get(product(2).productId)).toMatchObject({ count: '' });
    expect(onboardingSelectionCounts(selection)).toEqual({ selected: 2, entered: 1, incomplete: 1 });
  });

  it('blocks the 101st selection and writes numeric zero into every selected count', () => {
    let selection = new Map();
    for (let index = 1; index <= 100; index += 1) selection = addOnboardingSelection(selection, product(index)).selection;
    const capped = addOnboardingSelection(selection, product(101));
    expect(capped.capped).toBe(true);
    expect(capped.selection.size).toBe(100);
    const zeroed = setAllOnboardingCountsToZero(selection);
    expect([...zeroed.values()].every((entry) => entry.count === 0)).toBe(true);
    expect(buildOnboardingItems(zeroed).every((item) => item.openingCount === 0)).toBe(true);
  });

  it('invalidates an authoritative preview when any selected count changes', () => {
    let selection = addOnboardingSelection(new Map(), product(1)).selection;
    selection = updateOnboardingSelection(selection, product(1).productId, { count: 3 });
    const signature = onboardingItemsSignature(buildOnboardingItems(selection));
    expect(onboardingPreviewMatches(selection, signature)).toBe(true);
    selection = updateOnboardingSelection(selection, product(1).productId, { count: 4 });
    expect(onboardingPreviewMatches(selection, signature)).toBe(false);
  });

  it('blocks invalid counts locally and names the offending rows before building a request', () => {
    let selection = addOnboardingSelection(new Map(), product(1)).selection;
    selection = addOnboardingSelection(selection, product(2)).selection;
    selection = updateOnboardingSelection(selection, product(2).productId, { count: -1 });
    expect(validateOnboardingSelection(selection)).toEqual([
      expect.objectContaining({ productId: product(1).productId, name: 'Kozano Fan' }),
      expect.objectContaining({ productId: product(2).productId, name: 'Product 2' }),
    ]);
  });

  it('renders authoritative valid/skipped preview buckets and never presents skips as successes', () => {
    const preview = renderToStaticMarkup(<InventoryOnboardingPreview result={{
      dryRun: true, batchId: null,
      valid: [{ productId: product(1).productId, openingCount: 4 }],
      skipped: [{ productId: product(2).productId, reason: 'ALREADY_ONBOARDED' }],
      counts: { valid: 1, skipped: 1 },
    }} nameFor={(id) => id === product(1).productId ? 'Kozano Fan' : 'Product 2'} />);
    expect(preview).toContain('1 will be onboarded');
    expect(preview).toContain('Already onboarded — skipped, never overwritten');

    const outcome = renderToStaticMarkup(<InventoryOnboardingOutcome result={{
      dryRun: false, batchId: 'batch-1',
      written: [{ productId: product(1).productId, openingCount: 4, movementId: 'movement-1' }],
      skipped: [{ productId: product(2).productId, reason: 'PRODUCT_ARCHIVED' }],
      counts: { written: 1, skipped: 1 },
    }} nameFor={(id) => id === product(2).productId ? 'Product 2' : 'Kozano Fan'} />);
    expect(outcome).toContain('<strong>1</strong> written');
    expect(outcome).toContain('<strong>1</strong> skipped');
    expect(outcome).toContain('Skipped rows were not onboarded');
    expect(outcome).toContain('Product 2 — PRODUCT_ARCHIVED');
  });

  it('uses the no-password, no-reason batch API boundary', async () => {
    apiMock.get.mockResolvedValue({ data: { data: [product(1)], meta: { pagination: { page: 2, pageSize: 25, totalItems: 309, totalPages: 13 } } } });
    apiMock.post.mockResolvedValue({ data: { data: { dryRun: true, batchId: null, valid: [], skipped: [], counts: { valid: 0, skipped: 0 } } } });
    await inventoryApi.pendingOnboarding({ search: 'kozano', includeArchived: false, page: 2, pageSize: 25 });
    expect(apiMock.get).toHaveBeenCalledWith('/inventory/onboarding/pending', { params: { search: 'kozano', includeArchived: false, page: 2, pageSize: 25 } });
    const input = { dryRun: true as const, items: [{ productId: product(1).productId, openingCount: 0 }] };
    await inventoryApi.batchOnboarding(input);
    expect(apiMock.post).toHaveBeenCalledWith('/inventory/onboarding/batch', input);
    expect(input).not.toHaveProperty('accountPassword');
    expect(input).not.toHaveProperty('reason');
  });

  it('preserves the selected counts on submit failure and surfaces the server message verbatim', async () => {
    let selection = addOnboardingSelection(new Map(), product(1)).selection;
    selection = updateOnboardingSelection(selection, product(1).productId, { count: 9, note: 'Shelf A' });
    const before = buildOnboardingItems(selection);
    const error = { isAxiosError: true, response: { data: { error: { message: 'The product was already onboarded' } } } };
    apiMock.post.mockRejectedValueOnce(error);
    await expect(inventoryApi.batchOnboarding({
      items: before,
    })).rejects.toBe(error);
    expect(buildOnboardingItems(selection)).toEqual(before);
    expect(messageFrom(error, 'fallback')).toBe('The product was already onboarded');
  });

  it('uses server-side untracked filtering, pagination, the true total, and an admin entry point', () => {
    expect(inventoryProductFiltersFor('UNTRACKED', 'fan', 3, 25)).toMatchObject({
      search: 'fan', page: 3, pageSize: 25, trackStock: false,
    });
    const html = renderToStaticMarkup(<MemoryRouter><InventoryPage /></MemoryRouter>);
    expect(html).toContain('308 total / الإجمالي');
    expect(html).toContain('/inventory/onboarding');
    expect(html).toContain('Onboard products / إدراج المنتجات في المخزون');
    expect(html).toContain('309</span>');
  });
});
