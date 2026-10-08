import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProductCsvImportDialog, ALL_BRANDS_VALUE } from './ProductCsvImportDialog';

vi.mock('../../categories/categories', () => ({ useCategories: () => ({ data: [] }) }));
vi.mock('../hooks/useProducts', () => ({
  useProductBrands: () => ({ data: [{ canonical: 'TCL' }, { canonical: 'DSP' }] }),
  useCreateProductImport: () => ({ isPending: false }),
  useUpdateProductImport: () => ({ isPending: false }),
  useCommitProductImport: () => ({ isPending: false }),
}));

describe('CSV brand selection', () => {
  it('renders brands beside the file picker and defaults to All brands', () => {
    const html = renderToStaticMarkup(<ProductCsvImportDialog open onClose={() => {}} />);
    expect(html).toContain('type="file"');
    expect(html).toContain(`<option value="${ALL_BRANDS_VALUE}" selected="">All brands</option>`);
    expect(html).toContain('<option value="DSP">DSP</option>');
    expect(html).toContain('<option value="TCL">TCL</option>');
    expect(html).toContain('Detect each brand from the product description');
  });
});
