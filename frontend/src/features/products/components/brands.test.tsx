import React, { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { BrandsPage } from '../../../pages/products/BrandsPage';
import { productKeys, refreshAfterBrandNormalize } from '../hooks/useProducts';
import type { ProductBrandSummary } from '../types/product.types';
import {
  BrandCombobox,
  BrandNearMatchHint,
  brandKeyAction,
  filterBrandOptions,
  findBrandNearMatch,
} from './BrandCombobox';
import { ProductFilters, productBrandFilterPatch } from './ProductFilters';
import {
  BrandFixDialog,
  BrandFixPreview,
  applyBrandFix,
  brandFixFingerprint,
  brandFixReducer,
  canApplyBrandFix,
  completeBrandFix,
  initialBrandFixState,
  requestBrandFixPreview,
  validateBrandFix,
} from './BrandFixDialog';

const brands: ProductBrandSummary[] = [
  { canonical: 'Kozano', productCount: 20, spellings: ['Kozano', 'KOZANO', 'kozano'], spellingCounts: [{ spelling: 'Kozano', productCount: 12 }, { spelling: 'KOZANO', productCount: 5 }, { spelling: 'kozano', productCount: 3 }] },
  { canonical: 'DSP', productCount: 30, spellings: ['DSP', 'Dsp'], spellingCounts: [{ spelling: 'DSP', productCount: 28 }, { spelling: 'Dsp', productCount: 2 }] },
  { canonical: 'VGR', productCount: 11, spellings: ['VGR'], spellingCounts: [{ spelling: 'VGR', productCount: 11 }] },
];

const clientWithBrands = (data: ProductBrandSummary[] = brands) => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(productKeys.brands(), data);
  return client;
};

const renderCombobox = (value: string, client = clientWithBrands()) => renderToStaticMarkup(
  <QueryClientProvider client={client}>
    <MemoryRouter><BrandCombobox label="Brand / الماركة" value={value} onChange={() => undefined} defaultOpen /></MemoryRouter>
  </QueryClientProvider>
);

const elements = (node: ReactNode): ReactElement<Record<string, unknown>>[] => {
  if (!React.isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...React.Children.toArray(element.props.children as ReactNode).flatMap(elements)];
};

describe('product brand UI', () => {
  it('lists brands with counts and filters as the user types', () => {
    const html = renderCombobox('koz');
    expect(filterBrandOptions(brands, 'koz')).toEqual([brands[0]]);
    expect(html).toContain('Kozano');
    expect(html).toContain('20 products');
    expect(html).not.toContain('30 products');
  });

  it('suggests Kozano for KOZANO and adopts it only when clicked', () => {
    const match = findBrandNearMatch(brands, 'KOZANO');
    expect(match?.canonical).toBe('Kozano');
    expect(renderCombobox('KOZANO')).toContain('Did you mean');

    const adopt = vi.fn();
    const hint = BrandNearMatchHint({ match: match!, onAdopt: adopt }) as ReactElement<Record<string, unknown>>;
    const button = elements(hint).find((element) => element.type === 'button');
    (button?.props.onClick as (() => void) | undefined)?.();
    expect(adopt).toHaveBeenCalledWith('Kozano');
  });

  it('keeps ignored and genuinely new spellings unchanged, including on blur', () => {
    const ignored = 'KOZANO';
    const newBrand = 'Tuesday Supplier';
    expect(findBrandNearMatch(brands, newBrand)).toBeUndefined();
    expect(renderCombobox(ignored)).toContain('value="KOZANO"');
    expect(renderCombobox(newBrand)).toContain('value="Tuesday Supplier"');
    expect(ignored).toBe('KOZANO');
    expect(newBrand).toBe('Tuesday Supplier');
  });

  it('degrades a failed brand request to an enabled text input', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await client.fetchQuery({ queryKey: productKeys.brands(), queryFn: async () => { throw new Error('offline'); } }).catch(() => undefined);
    const html = renderCombobox('New Brand', client);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('value="New Brand"');
    expect(html).not.toContain('disabled=""');
  });

  it('supports arrow and Enter selection while Escape leaves the typed value alone', () => {
    expect(brandKeyAction('ArrowDown', -1, 3, false)).toEqual({ open: true, activeIndex: 0 });
    expect(brandKeyAction('ArrowDown', 0, 3, true)).toEqual({ open: true, activeIndex: 1 });
    expect(brandKeyAction('ArrowUp', 0, 3, true)).toEqual({ open: true, activeIndex: 2 });
    expect(brandKeyAction('Enter', 1, 3, true)).toEqual({ open: false, activeIndex: 1, selectIndex: 1 });
    expect(brandKeyAction('Escape', 1, 3, true)).toEqual({ open: false, activeIndex: -1 });
    expect('KOZANO').toBe('KOZANO');
  });

  it('uses an exact brand dropdown patch to filter the catalogue', () => {
    expect(productBrandFilterPatch('Kozano')).toEqual({ brand: 'Kozano', page: 1 });
    expect(productBrandFilterPatch('')).toEqual({ brand: undefined, page: 1 });
    const html = renderToStaticMarkup(<ProductFilters filters={{}} search="" onSearchChange={() => undefined} onChange={() => undefined} onSearchSubmit={() => undefined} onReset={() => undefined} searchInputRef={{ current: null }} brands={brands} />);
    expect(html).toContain('All brands / كل الماركات');
    expect(html).toContain('Kozano (20)');
  });

  it('renders brand counts, visible variants, and the in-product fix action without a SQL notice', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={clientWithBrands()}><MemoryRouter><BrandsPage /></MemoryRouter></QueryClientProvider>
    );
    expect(html).toContain('Kozano');
    expect(html).toContain('20');
    expect(html).toContain('3 spellings');
    expect(html).toContain('KOZANO');
    expect(html).toContain('/products?brand=Kozano');
    expect(html).toContain('Fix spellings / توحيد التهجئة');
    expect(html).not.toContain('2026-08-21-normalize-product-brands.sql');
    expect(html).not.toContain('Read-only brand spellings');
  });

  it('opens the fix dialog model with the majority spelling selected and Apply disabled', () => {
    const state = initialBrandFixState(brands[0]);
    expect(state.targetBrand).toBe('Kozano');
    expect(canApplyBrandFix(state)).toBe(false);
    const html = renderToStaticMarkup(<QueryClientProvider client={clientWithBrands()}><BrandFixDialog brand={brands[0]} open onClose={() => undefined} /></QueryClientProvider>);
    expect(html).toContain('Fix brand spellings / توحيد تهجئة الماركة');
    expect(html).toContain('Kozano');
    expect(html).toContain('12 products');
    expect(html).toContain('Preview is required before Apply');
    expect(html).toContain('Reason / السبب');
    expect(html).toContain('At least 5 characters / 5 أحرف على الأقل');
    expect(html).toMatch(/disabled=""[^>]*>Apply \/ تطبيق/);
  });

  it('refuses preview and surfaces a reason error when the reason is under five characters', async () => {
    const state = brandFixReducer(initialBrandFixState(brands[0]), { type: 'reason', value: '  no  ' });
    const normalize = vi.fn();
    const attempt = await requestBrandFixPreview(state, normalize);
    expect(attempt.errors.reason).toContain('at least 5 characters');
    expect(normalize).not.toHaveBeenCalled();
    expect(validateBrandFix({ ...state, reason: 'Valid reason' }).reason).toBeUndefined();
  });

  it('lists exact affected product names and SKUs in the preview', () => {
    const html = renderToStaticMarkup(<BrandFixPreview result={{
      targetBrand: 'Kozano', affectedCount: 2, warnings: [], products: [
        { id: 'one', sku: 'HC-000001', name: 'Kettle', brand: 'KOZANO' },
        { id: 'two', sku: 'HC-000002', name: 'Toaster', brand: 'kozano' },
      ],
    }} />);
    expect(html).toContain('Kettle');
    expect(html).toContain('HC-000001');
    expect(html).toContain('Toaster');
    expect(html).toContain('HC-000002');
  });

  it('re-disables Apply when the target, source, or reason changes after preview', () => {
    let state = brandFixReducer(initialBrandFixState(brands[0]), { type: 'reason', value: 'Normalize Kozano spelling' });
    const result = { targetBrand: 'Kozano', affectedCount: 8, products: [], warnings: [] };
    state = brandFixReducer(state, { type: 'preview', result, fingerprint: brandFixFingerprint(state) });
    expect(canApplyBrandFix(state)).toBe(true);
    expect(canApplyBrandFix(brandFixReducer(state, { type: 'target', value: 'KOZANO' }))).toBe(false);
    expect(canApplyBrandFix(brandFixReducer(state, { type: 'source', value: 'kozano', selected: false }))).toBe(false);
    expect(canApplyBrandFix(brandFixReducer(state, { type: 'reason', value: 'Different reason' }))).toBe(false);
  });

  it('discards an older preview response when the reason changes before it arrives', () => {
    const requested = brandFixReducer(initialBrandFixState(brands[0]), { type: 'reason', value: 'First cleanup reason' });
    const changed = brandFixReducer(requested, { type: 'reason', value: 'Later cleanup reason' });
    const stale = brandFixReducer(changed, {
      type: 'preview', fingerprint: brandFixFingerprint(requested),
      result: { targetBrand: 'Kozano', affectedCount: 8, products: [], warnings: [] },
    });
    expect(stale.preview).toBeNull();
  });

  it('sends the trimmed typed reason on both preview and apply requests', async () => {
    let state = brandFixReducer(initialBrandFixState(brands[0]), { type: 'reason', value: '  Normalize Kozano spellings  ' });
    const normalize = vi.fn()
      .mockResolvedValueOnce({ targetBrand: 'Kozano', affectedCount: 8, products: [], warnings: [] })
      .mockResolvedValueOnce({ targetBrand: 'Kozano', updatedCount: 8, products: [] });
    const attempt = await requestBrandFixPreview(state, normalize);
    if (!('result' in attempt) || !attempt.result || !attempt.fingerprint) throw new Error('Expected preview result');
    state = brandFixReducer(state, { type: 'preview', result: attempt.result, fingerprint: attempt.fingerprint });
    await applyBrandFix(state, normalize, vi.fn(), vi.fn());
    expect(normalize).toHaveBeenNthCalledWith(1, expect.objectContaining({ reason: 'Normalize Kozano spellings', dryRun: true }));
    expect(normalize).toHaveBeenNthCalledWith(2, expect.objectContaining({ reason: 'Normalize Kozano spellings', dryRun: false }));
  });

  it('closes and reports the updated count after a successful fix', () => {
    const close = vi.fn();
    const notify = vi.fn();
    completeBrandFix({ targetBrand: 'Kozano', updatedCount: 8, products: [] }, close, notify);
    expect(close).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('8'));
  });

  it('keeps selections and the dialog open while surfacing a failed apply message verbatim', async () => {
    let state = brandFixReducer(initialBrandFixState(brands[0]), { type: 'reason', value: 'Normalize Kozano spellings' });
    state = brandFixReducer(state, {
      type: 'preview', fingerprint: brandFixFingerprint(state),
      result: { targetBrand: 'Kozano', affectedCount: 8, products: [], warnings: [] },
    });
    const snapshot = structuredClone(state);
    const close = vi.fn();
    const normalize = vi.fn().mockRejectedValue({ isAxiosError: true, response: { data: { error: { message: 'Exact server failure' } } } });
    await expect(applyBrandFix(state, normalize, close)).resolves.toBe('Exact server failure');
    expect(normalize).toHaveBeenCalledWith(expect.objectContaining({ reason: 'Normalize Kozano spellings', dryRun: false }));
    expect(close).not.toHaveBeenCalled();
    expect(state).toEqual(snapshot);
  });

  it('refreshes all product and brand queries only after a write', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await refreshAfterBrandNormalize(client, { sourceBrands: ['GENERAL'], targetBrand: 'General', reason: 'Normalize spelling', dryRun: false });
    expect(invalidate).toHaveBeenCalledWith({ predicate: expect.any(Function) });
    // Lists, brand summaries and details refresh; the authenticated image blobs
    // do not, so renaming a brand cannot re-download every picture on screen.
    const { predicate } = invalidate.mock.calls[0][0] as { predicate: (query: { queryKey: readonly unknown[] }) => boolean };
    expect(predicate({ queryKey: productKeys.list({}) })).toBe(true);
    expect(predicate({ queryKey: productKeys.brands() })).toBe(true);
    expect(predicate({ queryKey: productKeys.detail('any') })).toBe(true);
    expect(predicate({ queryKey: productKeys.image('any', '2026-01-01') })).toBe(false);
    expect(predicate({ queryKey: ['customers', 'list'] })).toBe(false);
    invalidate.mockClear();
    await refreshAfterBrandNormalize(client, { sourceBrands: ['GENERAL'], targetBrand: 'General', reason: 'Normalize spelling', dryRun: true });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
