// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProductCsvImportDialog } from './ProductCsvImportDialog';

const { createImport, updateImport, commitImport, categories } = vi.hoisted(() => ({
  createImport: vi.fn(),
  updateImport: vi.fn(),
  commitImport: vi.fn(),
  categories: [
    {
      id: 'beauty',
      name: 'Beauty',
      parentId: null,
      isActive: true,
      assignable: false,
      childCount: 1,
    },
    {
      id: 'home',
      name: 'Home Appliances',
      parentId: null,
      isActive: true,
      assignable: false,
      childCount: 1,
    },
    {
      id: 'dryer',
      name: 'Hair Dryers',
      parentId: 'beauty',
      isActive: true,
      assignable: true,
      childCount: 0,
    },
    {
      id: 'ac',
      name: 'Air Conditioners',
      parentId: 'home',
      isActive: true,
      assignable: true,
      childCount: 0,
    },
  ],
}));
vi.mock('../../categories/categories', () => ({
  useCategories: () => ({ data: categories, refetch: async () => ({ data: categories }) }),
}));
vi.mock('../hooks/useProducts', () => ({
  useProductBrands: () => ({ data: [] }),
  useCreateProductImport: () => ({ isPending: false, mutateAsync: createImport }),
  useUpdateProductImport: () => ({ isPending: false, mutateAsync: updateImport }),
  useCommitProductImport: () => ({ isPending: false, mutateAsync: commitImport }),
}));
vi.mock('../../../components/ui/Modal', () => ({
  Modal: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  createImport.mockResolvedValue({
    id: 'draft',
    rows: [
      {
        rowNumber: 1,
        family: 'ELECTRONICS',
        description: 'DSP HAIR DRYER',
        externalCode: 'D1',
        productType: 'Hair Dryers',
        quantity: 1,
        issues: [],
        conflicts: [],
        matches: [],
      },
      {
        rowNumber: 2,
        family: 'BEAUTY',
        description: 'UNKNOWN PRODUCT',
        externalCode: 'U1',
        productType: null,
        quantity: 1,
        issues: [],
        conflicts: [],
        matches: [],
      },
    ],
  });
  updateImport.mockImplementation(async ({ categoryMappings }) => {
    const initial = await createImport();
    const rows = initial.rows.map((row: { rowNumber: number }) => ({
      ...row,
      categoryId: categoryMappings[row.rowNumber === 1 ? 'type:Hair Dryers' : 'row:2'],
      status:
        row.rowNumber === 1 || Object.prototype.hasOwnProperty.call(categoryMappings, 'row:2')
          ? 'READY'
          : 'CONFLICT',
      conflicts:
        row.rowNumber === 2 && !Object.prototype.hasOwnProperty.call(categoryMappings, 'row:2')
          ? [{ kind: 'CATEGORY' }]
          : [],
    }));
    return {
      ...initial,
      rows,
      categoryMappings,
      counts: {
        total: 2,
        quantity: 2,
        ready: rows.filter((row: { status: string }) => row.status === 'READY').length,
        conflicts: 0,
        invalid: 0,
      },
    };
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const button = (text: string) =>
  [...container.querySelectorAll('button')].find((element) => element.textContent === text)!;
const change = (select: HTMLSelectElement, value: string) =>
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });

it('automatically assigns known products and restricts unidentified products to the chosen family', async () => {
  act(() => root.render(<ProductCsvImportDialog open onClose={() => {}} />));
  const fileInput = container.querySelector('input[type=file]')!;
  Object.defineProperty(fileInput, 'files', {
    value: [{ name: 'ALLPRODUCTS.csv', text: async () => 'csv' }],
  });
  act(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
  await act(async () => button('Read CSV').click());
  expect(updateImport).toHaveBeenCalledWith({
    id: 'draft',
    categoryMappings: { 'type:Hair Dryers': 'dryer' },
  });
  expect(container.querySelector('fieldset')?.textContent).toContain('Beauty');
  expect(container.querySelector('fieldset select')).toBeNull();
  expect(container.querySelectorAll('select')).toHaveLength(1);

  change(container.querySelector('select')!, 'beauty');
  const categorySelect = container.querySelectorAll('select')[1];
  expect([...categorySelect.options].map((option) => option.text)).toEqual([
    'Choose category…',
    'Hair Dryers',
  ]);
  change(categorySelect, 'dryer');
  expect(button('Import products').disabled).toBe(true);
  await act(async () => button('Save classifications and continue').click());
  expect(button('Import products').disabled).toBe(false);

  change(container.querySelector('select')!, 'home');
  expect(button('Import products').disabled).toBe(true);
  expect([...container.querySelectorAll('select')[1].options].map((option) => option.text)).toEqual(
    ['Choose category…', 'Air Conditioners']
  );
  expect(container.querySelectorAll('select')[1].value).toBe('');
});
