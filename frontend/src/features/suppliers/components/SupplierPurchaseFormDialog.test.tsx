import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Supplier } from '../types/supplier.types';

const { hooks } = vi.hoisted(() => ({
  hooks: {
    create: { mutateAsync: vi.fn(), isPending: false },
    receipt: { data: undefined as { duplicate: boolean; matches: Array<Record<string, string>> } | undefined },
  },
}));

vi.mock('../hooks/useSupplierPurchases', () => ({
  useCreateSupplierPurchase: () => hooks.create,
  useReceiptCheck: () => hooks.receipt,
}));
vi.mock('../../products/components/ProductPicker', () => ({
  ProductPicker: (props: { requireOpeningCount?: boolean }) =>
    <div data-testid="product-picker" data-require-opening-count={String(Boolean(props.requireOpeningCount))}>picker</div>,
}));

import { SupplierPurchaseFormDialog } from './SupplierPurchaseFormDialog';

const supplier = { id: 'supplier-1', name: 'TCL Distributor', phone: '70123456' } as Supplier;
const render = () => renderToStaticMarkup(
  <MemoryRouter><SupplierPurchaseFormDialog open supplier={supplier} onClose={() => undefined} /></MemoryRouter>
);

describe('SupplierPurchaseFormDialog', () => {
  it('offers all three line modes in one form', () => {
    const html = render();
    expect(html).toContain('Existing product');
    expect(html).toContain('Quick add product');
    expect(html).toContain('Description only');
  });

  it('asks for a receipt number and a purchase date on the purchase itself', () => {
    const html = render();
    expect(html).toContain('Receipt / invoice no.');
    expect(html).toContain('Purchase date');
  });

  /** Product lines move stock by default, so the picker must enforce onboarding. */
  it('requires a verified opening count in the product picker', () => {
    expect(render()).toContain('data-require-opening-count="true"');
  });

  it('blocks submission until the form is complete and says why', () => {
    const html = render();
    expect(html).toContain('Add a line so the description can be filled in');
    expect(html).toMatch(/<button type="submit"[^>]*disabled/);
  });

  /** Typing a description for every invoice is friction, so it is derived by default. */
  it('presents the description as auto-filled from the lines', () => {
    const html = render();
    expect(html).toContain('Filled in from the lines');
    // A textarea, because the description carries one line per language.
    expect(html).toMatch(/<textarea id="purchase-description"[^>]*rows="3"/);
    // Nothing is entered yet, so there is nothing to suggest.
    expect(html).toMatch(/<textarea id="purchase-description"[^>]*><\/textarea>/);
  });

  it('warns about a reused receipt number without blocking the save', () => {
    hooks.receipt.data = { duplicate: true, matches: [{ transactionDate: '2026-08-14', amount: '630.00' }] };
    const html = render();
    expect(html).toContain('already recorded for this supplier');
    expect(html).toContain('You can still save if this is genuinely a second invoice');
    hooks.receipt.data = undefined;
  });

  it('shows the running total from the line sum', () => {
    const html = render();
    expect(html).toContain('Total debt');
    expect(html).toContain('Set the total by hand');
  });

  it('does not ask for a password when no new product is being added', () => {
    expect(render()).not.toContain('Account password');
  });
});
