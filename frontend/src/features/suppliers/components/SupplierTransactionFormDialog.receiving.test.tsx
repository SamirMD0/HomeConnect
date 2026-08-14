import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Supplier } from '../types/supplier.types';
import { SupplierTransactionFormDialog } from './SupplierTransactionFormDialog';

vi.mock('../hooks/useSupplierMutations', () => ({
  useSupplierTransactionMutations: () => ({
    create: { mutateAsync: vi.fn(), isPending: false }, update: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('../../inventory/receiving/hooks/useSupplierReceivings', () => ({
  useSupplierReceivings: () => ({ data: { items: [
    { id: 'receiving-1', receivedOn: '2026-08-14', referenceNumber: 'INV-200', _count: { items: 1, transactions: 0 } },
    { id: 'receiving-2', receivedOn: '2026-08-13', referenceNumber: 'INV-199', _count: { items: 2, transactions: 1 } },
  ] } }),
  useSupplierReceiving: (id: string) => ({ data: id ? { id, items: [{ id: 'item-1', quantity: 3, product: { id: 'product-1', name: 'Coffee grinder', sku: 'HC-1' } }] } : undefined, isLoading: false }),
}));

const supplier = { id: 'supplier-1', name: 'Supplier One', phone: '70123456' } as Supplier;

describe('supplier transaction receiving selector', () => {
  it('lists supplier receivings and marks an already-linked document unavailable', () => {
    const html = renderToStaticMarkup(<MemoryRouter><SupplierTransactionFormDialog open supplier={supplier} onClose={() => undefined} /></MemoryRouter>);
    expect(html).toContain('Receiving document (optional)');
    expect(html).toContain('INV-200');
    expect(html).toContain('INV-199');
    expect(html).toContain('Already linked');
  });

  it('shows linked products and a receiving-document link while leaving amount blank', () => {
    const html = renderToStaticMarkup(<MemoryRouter><SupplierTransactionFormDialog open supplier={supplier} prefill={{ type: 'SUPPLIER_DEBT', supplierReceivingId: 'receiving-1' }} onClose={() => undefined} /></MemoryRouter>);
    expect(html).toContain('/inventory/receiving/receiving-1');
    expect(html).toContain('Coffee grinder');
    expect(html).toContain('HC-1');
    expect(html).toContain('× 3');
    expect(html).toMatch(/Amount \/ المبلغ[\s\S]*value=""/);
  });
});
