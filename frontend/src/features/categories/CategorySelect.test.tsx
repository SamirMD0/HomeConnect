import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CategorySelect } from './CategorySelect';
import type { Category } from './categories';

const rows: Category[] = [
  {
    id: 'c',
    name: 'Cookers',
    parentId: 'b',
    isActive: true,
    assignable: true,
    path: 'Home Appliances → Kitchen → Cookers',
    productCount: 2,
    childCount: 0,
    level: 3,
  },
  {
    id: 'd',
    name: 'TV',
    parentId: null,
    isActive: false,
    assignable: false,
    path: 'Electronics → TV',
    productCount: 1,
    childCount: 0,
    level: 2,
  },
];
describe('English category selection', () => {
  it('renders English labels and full nested paths without an Arabic field', () => {
    const html = renderToStaticMarkup(
      <CategorySelect categories={rows} value="" onChange={() => {}} />
    );
    expect(html).toContain('Category');
    expect(html).toContain('Uncategorized');
    expect(html).toContain('Home Appliances → Kitchen → Cookers');
    expect(html).not.toMatch(/[\u0600-\u06ff]/);
    expect(html).toMatch(/disabled=""[^>]*>Electronics → TV/);
  });
  it('keeps inactive existing assignments readable and selectable without a forced change', () => {
    const html = renderToStaticMarkup(
      <CategorySelect categories={rows} value="d" onChange={() => {}} />
    );
    expect(html).toMatch(/value="d" selected=""/);
    expect(html).toContain('inactive');
  });
  it('has an all-categories filter and does not hide inactive or uncategorized products', () => {
    const html = renderToStaticMarkup(
      <CategorySelect categories={rows} value="uncategorized" onChange={() => {}} filter />
    );
    expect(html).toContain('All categories');
    expect(html).toContain('Filter by category');
    expect(html).toMatch(/value="uncategorized" selected=""/);
    expect(html).not.toContain('disabled=""');
  });
  it('retains an existing selection when the category list is unavailable', () => {
    expect(
      renderToStaticMarkup(<CategorySelect categories={[]} value="existing" onChange={() => {}} />)
    ).toContain('value="existing" selected=""');
  });
});
