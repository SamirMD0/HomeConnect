import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SupplierLedgerFilters } from './SupplierLedgerFilters';
import { SupplierSummaryCards } from './SupplierSummaryCards';
import { SupplierTable } from './SupplierTable';
import { SupplierTransactionTable } from './SupplierTransactionTable';
import { Supplier, SupplierTransaction } from '../types/supplier.types';
import { applySupplierLedgerMonthFilter, hasActiveSupplierLedgerFilters, resetSupplierLedgerFilters } from '../utils/supplier-query';

const supplier: Supplier = { id: 'supplier-1', name: 'شركة النور', phone: '70123456', companyName: 'النور', secondaryPhone: null, email: null, notes: null, isActive: true, archivedAt: null, archivedReason: null, createdAt: '2026-07-29T10:00:00Z', updatedAt: '2026-07-29T10:00:00Z', balance: '150.00' };
const transaction: SupplierTransaction = { id: 'transaction-1', supplierId: supplier.id, supplier, type: 'SUPPLIER_DEBT', direction: 'INCREASE_OWED', amount: '150.00', transactionDate: '2026-07-29', description: 'شراء مكيف', reference: null, notes: null, status: 'ACTIVE', removedAt: null, removedReason: null, createdAt: '2026-07-29T10:00:00Z', updatedAt: '2026-07-29T10:00:00Z', createdBy: { id: 'user-1', fullName: 'Admin', username: 'admin' } };
const noop = () => undefined;

describe('supplier components', () => {
  it('renders bilingual, direction-aware directory and transaction views', () => {
    const directory = renderToStaticMarkup(<MemoryRouter><SupplierTable items={[supplier]} canMutate onEdit={noop} onArchive={noop} onRestore={noop} /></MemoryRouter>);
    expect(directory).toContain('شركة النور');
    expect(directory).toContain('Archive / أرشفة');
    expect(directory).toContain('dir="auto"');
    const ledger = renderToStaticMarkup(<SupplierTransactionTable items={[transaction]} canMutate onEdit={noop} onRemove={noop} onRestore={noop} />);
    expect(ledger).toContain('Supplier Debt / دين للمورّد');
    expect(ledger).toContain('+ Owed / مستحق');
    expect(ledger).toContain('Remove / حذف');
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
});
