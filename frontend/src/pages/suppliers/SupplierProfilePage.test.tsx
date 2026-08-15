import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../features/suppliers/hooks/useSuppliers', () => ({
  useSupplier: () => ({ isLoading: false, isError: false, data: {
    id: 'supplier-1', name: 'Supplier One', phone: '70123456', secondaryPhone: null, companyName: null,
    email: null, notes: null, isActive: true, archivedAt: null, archivedReason: null,
    createdAt: '2026-08-14T10:00:00.000Z', updatedAt: '2026-08-14T10:00:00.000Z', balance: '0.00',
  } }),
  useSupplierTransactions: () => ({ isLoading: false, isError: false, data: { items: [], pagination: { totalPages: 0 } } }),
  useSupplierAudit: () => ({ isLoading: false, data: { items: [] } }),
}));
vi.mock('../../features/suppliers/hooks/useSupplierMutations', () => ({
  useSupplierMutations: () => ({}), useSupplierTransactionMutations: () => ({}),
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'EMPLOYEE' } }) }));
vi.mock('../../features/suppliers/components/SupplierFormDialog', () => ({ SupplierFormDialog: () => null }));
vi.mock('../../features/suppliers/components/SupplierTransactionFormDialog', () => ({ SupplierTransactionFormDialog: () => null }));
vi.mock('../../features/suppliers/components/SupplierPurchaseFormDialog', () => ({ SupplierPurchaseFormDialog: () => null }));
vi.mock('../../features/suppliers/components/SupplierActionDialog', () => ({ SupplierActionDialog: () => null }));
vi.mock('../../features/inventory/receiving/components/SupplierReceivingHistory', () => ({
  SupplierReceivingHistory: ({ supplierId }: { supplierId: string }) => <section data-supplier-id={supplierId}><h2>Receiving History / سجل إدخال المخزون</h2><p>Inventory documents only — separate from financial transactions</p></section>,
}));

import { SupplierProfilePage } from './SupplierProfilePage';

describe('SupplierProfilePage receiving integration', () => {
  it('places read-only receiving history separately from financial transactions', () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/suppliers/supplier-1']}><Routes><Route path="/suppliers/:id" element={<SupplierProfilePage />} /></Routes></MemoryRouter>);
    expect(html).toContain('data-supplier-id="supplier-1"');
    expect(html).toContain('Receiving History / سجل إدخال المخزون');
    expect(html).toContain('Transactions / الحركات');
    expect(html.indexOf('Receiving History')).toBeLessThan(html.indexOf('Transactions / الحركات'));
    expect(html).toContain('separate from financial transactions');
  });
});
