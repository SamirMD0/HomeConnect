import { describe, expect, it } from 'vitest';
import { productSearchParams, productViewSearchParams, resolveProductView } from './product-view';

describe('product view persistence', () => {
  it('keeps table as the default and uses the sticky preference only without a URL value', () => {
    expect(resolveProductView(new URLSearchParams())).toBe('table');
    expect(resolveProductView(new URLSearchParams(), 'grid')).toBe('grid');
  });

  it('lets the URL survive reload and override local storage', () => {
    expect(resolveProductView(new URLSearchParams('view=grid'), 'table')).toBe('grid');
    expect(resolveProductView(new URLSearchParams('view=table'), 'grid')).toBe('table');
  });

  it('switches views without disturbing search, filters, or focus state', () => {
    const next = productViewSearchParams(new URLSearchParams('search=fan&status=active&focus=p1'), 'grid');
    expect(next.toString()).toContain('view=grid');
    expect(next.get('search')).toBe('fan');
    expect(next.get('status')).toBe('active');
    expect(next.get('focus')).toBe('p1');
  });

  it('keeps the current page when search has not changed', () => {
    const current = new URLSearchParams('search=fan&page=2&status=active');
    const next = productSearchParams(current, 'fan');

    expect(next).toBe(current);
    expect(next.get('page')).toBe('2');
  });

  it('resets the current page when search changes', () => {
    const next = productSearchParams(new URLSearchParams('search=fan&page=2&status=active'), 'fridge');

    expect(next.get('search')).toBe('fridge');
    expect(next.has('page')).toBe(false);
    expect(next.get('status')).toBe('active');
  });
});
