import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SupplierLedgerFilters } from './SupplierLedgerFilters';
import { SupplierSummaryCards } from './SupplierSummaryCards';
import { SupplierTable } from './SupplierTable';
import { SupplierTransactionTable } from './SupplierTransactionTable';
import { supplierTransactionFormFromPrefill } from './SupplierTransactionFormDialog';
import { Supplier, SupplierTransaction } from '../types/supplier.types';
import { applySupplierLedgerMonthFilter, hasActiveSupplierLedgerFilters, resetSupplierLedgerFilters } from '../utils/supplier-query';

const supplier: Supplier = { id: 'supplier-1', name: 'شركة النور', phone: '70123456', companyName: 'النور', secondaryPhone: null, email: null, notes: null, isActive: true, archivedAt: null, archivedReason: null, createdAt: '2026-07-29T10:00:00Z', updatedAt: '2026-07-29T10:00:00Z', balance: '150.00' };
const transaction: SupplierTransaction = { id: 'transaction-1', supplierId: supplier.id, supplier, type: 'SUPPLIER_DEBT', direction: 'INCREASE_OWED', amount: '150.00', transactionDate: '2026-07-29', description: 'شراء مكيف', reference: null, notes: null, status: 'ACTIVE', removedAt: null, removedReason: null, createdAt: '2026-07-29T10:00:00Z', updatedAt: '2026-07-29T10:00:00Z', createdBy: { id: 'user-1', fullName: 'Admin', username: 'admin' } };
const noop = () => undefined;

describe('supplier components', () => {
  it('renders a bilingual directory and an English compact transaction table', () => {
    const directory = renderToStaticMarkup(<MemoryRouter><SupplierTable items={[supplier]} canMutate onEdit={noop} onArchive={noop} onRestore={noop} /></MemoryRouter>);
    expect(directory).toContain('شركة النور');
    expect(directory).toContain('Archive / أرشفة');
    expect(directory).toContain('dir="auto"');
    const ledger = renderToStaticMarkup(<SupplierTransactionTable items={[transaction]} canMutate onEdit={noop} onRemove={noop} onRestore={noop} />);
    expect(ledger).toContain('Supplier Debt');
    expect(ledger).toContain('+ Owed');
    expect(ledger).toContain('Remove');
    expect(ledger).not.toContain('Supplier Debt / دين للمورّد');
    expect(ledger).not.toContain('Remove / حذف');
    expect(ledger).toContain('data-testid="supplier-ledger-scroll-table"');
    expect(ledger).toContain('data-table-scroll');
    expect(ledger).toContain('data-table-scroll-expanded');
    expect(ledger).toContain('group-hover:bg-gray-600');
    expect(ledger).toContain('group-hover:text-yellow-300');
  });

  it('renders authoritative summary amounts and removed-record filter', () => {
    const summary = renderToStaticMarkup(<SupplierSummaryCards summary={{ totalOwed: '300.00', totalPaid: '100.00', totalCredit: '50.00', balance: '150.00', transactionCount: 3, basis: 'filtered' }} />);
    expect(summary).toContain('$150.00');
    const filters = renderToStaticMarkup(<SupplierLedgerFilters filters={resetSupplierLedgerFilters()} suppliers={[supplier]} onChange={noop} onClear={noop} />);
    expect(filters).toContain('Include removed / إظهار المحذوف');
  });

  it('resets filters and creates exact UTC-neutral month bounds', () => {
    expect(hasActiveSupplierLedgerFilters({ search: 'invoice' })).toBe(true);
    expect(resetSupplierLedgerFilters()).toMatchObject({ page: 1, includeRemoved: false, sortBy: 'transactionDate' });
    expect(applySupplierLedgerMonthFilter({}, '2026-02')).toMatchObject({ dateFrom: '2026-02-01', dateTo: '2026-02-28', page: 1 });
  });

  it('prefills a supplier debt bridge while always leaving amount blank', () => {
    const form = supplierTransactionFormFromPrefill({
      type: 'SUPPLIER_DEBT', transactionDate: '2026-08-14', reference: 'INV-200', description: 'Supplier receiving INV-200', supplierReceivingId: 'receiving-1',
    });
    expect(form).toMatchObject({ type: 'SUPPLIER_DEBT', transactionDate: '2026-08-14', reference: 'INV-200', description: 'Supplier receiving INV-200', supplierReceivingId: 'receiving-1', amount: '' });
  });

  it('links ledger rows back to their receiving document and products', () => {
    const linked = { ...transaction, supplierReceivingId: 'receiving-1', supplierReceiving: { id: 'receiving-1', referenceNumber: 'INV-200', receivedOn: '2026-08-14', items: [{ quantity: 2, product: { id: 'product-1', name: 'Coffee grinder', sku: 'HC-1' } }] } };
    const html = renderToStaticMarkup(<MemoryRouter><SupplierTransactionTable items={[linked]} canMutate onEdit={noop} onRemove={noop} onRestore={noop} /></MemoryRouter>);
    expect(html).toContain('/inventory/receiving/receiving-1');
    expect(html).toContain('Receiving: INV-200');
    expect(html).toContain('Coffee grinder ×2');
  });
});
