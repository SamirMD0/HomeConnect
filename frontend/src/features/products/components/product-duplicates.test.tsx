import { Children, isValidElement, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Product, ProductDuplicateMatch } from '../types/product.types';
import {
  PRODUCT_DUPLICATE_DEBOUNCE_MS,
  normalizeProductDuplicateQuery,
  scheduleProductDuplicateQuery,
  shouldCheckProductDuplicate,
} from '../hooks/useProducts';
import {
  hasBlockingProductDuplicate,
  isProductSaveDisabled,
  productDuplicateQueryForForm,
} from './ProductFormDialog';
import { ProductDuplicateInlineError, ProductDuplicateWarning } from './ProductDuplicateWarning';

const match = (reason: ProductDuplicateMatch['reason'], overrides: Partial<ProductDuplicateMatch> = {}): ProductDuplicateMatch => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Existing Fan',
  model: 'F1',
  brand: 'Ariete',
  sku: 'HC-000001',
  barcode: 'ABC-1234',
  isActive: true,
  reason,
  ...overrides,
});

const findButton = (node: ReactNode, text: string): ReactElement<{ onClick?: () => void; children?: ReactNode }> | undefined => {
  if (!isValidElement(node)) return undefined;
  const element = node as ReactElement<{ onClick?: () => void; children?: ReactNode }>;
  const content = Children.toArray(element.props.children).map((child) => typeof child === 'string' ? child : '').join('');
  if (element.type === 'button' && content.includes(text)) return element;
  return Children.toArray(element.props.children).map((child) => findButton(child, text)).find(Boolean);
};

describe('product duplicate detection frontend', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the owning product for a taken barcode and blocks Save until the value is cleared', () => {
    const taken = match('BARCODE_TAKEN');
    const html = renderToStaticMarkup(<MemoryRouter><ProductDuplicateInlineError field="Barcode" matches={[taken]} onView={() => undefined} /></MemoryRouter>);

    expect(html).toContain('Barcode already used by');
    expect(html).toContain('Existing Fan');
    expect(html).toContain('Open / فتح');
    expect(hasBlockingProductDuplicate([taken])).toBe(true);
    expect(isProductSaveDisabled(false, [taken])).toBe(true);
    expect(isProductSaveDisabled(false, [])).toBe(false);
  });

  it('warns for the same name/model, names the reason, and Continue Anyway remains non-blocking', () => {
    const warning = match('SAME_NAME_MODEL');
    const onContinue = vi.fn();
    const tree = ProductDuplicateWarning({ matches: [warning], onContinue, onView: vi.fn() }) as ReactElement;
    const html = renderToStaticMarkup(<MemoryRouter>{tree}</MemoryRouter>);

    expect(html).toContain('Same name and model / نفس الاسم والموديل');
    expect(html).toContain('Continue Anyway / المتابعة على أي حال');
    expect(isProductSaveDisabled(false, [warning])).toBe(false);
    findButton(tree, 'Continue Anyway')?.props.onClick?.();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('names model/brand overlap but never offers Continue Anyway for a blocking reason', () => {
    const near = renderToStaticMarkup(<MemoryRouter><ProductDuplicateWarning matches={[match('SAME_MODEL_BRAND')]} onContinue={() => undefined} onView={() => undefined} /></MemoryRouter>);
    const blocked = renderToStaticMarkup(<MemoryRouter><ProductDuplicateWarning matches={[match('SKU_TAKEN')]} onContinue={() => undefined} onView={() => undefined} /></MemoryRouter>);
    const skuInline = renderToStaticMarkup(<MemoryRouter><ProductDuplicateInlineError field="SKU" matches={[match('SKU_TAKEN')]} onView={() => undefined} /></MemoryRouter>);

    expect(near).toContain('Same model and brand / نفس الموديل والماركة');
    expect(blocked).not.toContain('Continue Anyway');
    expect(skuInline).toContain('SKU already used by');
    expect(skuInline).toContain('Existing Fan');
  });

  it('passes the edited product id for exclusion and checks only a changed barcode', () => {
    const product = { id: '22222222-2222-4222-8222-222222222222', barcode: 'ABC-1234' } as Product;
    const values = { name: 'Fan', model: 'F1', brand: 'Ariete', barcode: 'ABC-1234', price: '', discount: '', imageUrl: '', notes: '' };

    expect(productDuplicateQueryForForm(values, product)).toMatchObject({
      name: 'Fan', model: 'F1', brand: 'Ariete', barcode: undefined, excludeProductId: product.id,
    });
    expect(productDuplicateQueryForForm({ ...values, barcode: 'XYZ-9999' }, product)).toMatchObject({
      barcode: 'XYZ-9999', excludeProductId: product.id,
    });
  });

  it('debounces rapid identity typing into one duplicate request', () => {
    vi.useFakeTimers();
    const request = vi.fn();
    let cancel: () => void = () => undefined;
    for (const value of ['A', 'AB', 'ABC-1234']) {
      cancel();
      cancel = scheduleProductDuplicateQuery({ barcode: value }, request);
    }

    vi.advanceTimersByTime(PRODUCT_DUPLICATE_DEBOUNCE_MS - 1);
    expect(request).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ barcode: 'ABC-1234' });
    cancel();
  });

  it('normalizes optional query fields and enables only valid lookup combinations', () => {
    expect(normalizeProductDuplicateQuery({ name: ' Fan ', model: ' F1 ', sku: ' hc-1 ' })).toEqual({
      name: 'Fan', model: 'F1', brand: undefined, barcode: undefined, sku: 'HC-1', excludeProductId: undefined,
    });
    expect(shouldCheckProductDuplicate({ name: 'Fan' })).toBe(false);
    expect(shouldCheckProductDuplicate({ name: 'Fan', model: 'F1' })).toBe(true);
    expect(shouldCheckProductDuplicate({ barcode: 'ABC-1234' })).toBe(true);
  });
});
