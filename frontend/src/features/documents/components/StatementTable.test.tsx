import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { toCustomerStatementRows } from './CustomerStatementPanel';
import { splitEffect, StatementTable } from './StatementTable';
import { toSupplierStatementRows } from './SupplierStatementPanel';

describe('splitEffect', () => {
  it('puts a charge to a customer under debit and a payment under credit', () => {
    expect(splitEffect('100.00', 'debit')).toEqual({ debit: '100.00', credit: null });
    expect(splitEffect('-40.00', 'debit')).toEqual({ debit: null, credit: '40.00' });
  });

  it('puts a purchase from a supplier under credit and a payment under debit', () => {
    expect(splitEffect('100.00', 'credit')).toEqual({ debit: null, credit: '100.00' });
    expect(splitEffect('-40.00', 'credit')).toEqual({ debit: '40.00', credit: null });
  });

  it('leaves both columns empty when the entry moved nothing', () => {
    expect(splitEffect('0.00', 'debit')).toEqual({ debit: null, credit: null });
  });
});

const entry = {
  id: 'e-1', date: '2026-03-05', description: 'Air conditioner', reference: 'SO-1', originalAmount: '100.00',
  currency: 'USD' as const, exchangeRate: '1', baseAmount: '100.00', dueDate: null,
};

describe('statement rows', () => {
  it('labels a voided customer payment and leaves its amounts empty', () => {
    const [row] = toCustomerStatementRows([
      { ...entry, type: 'PAYMENT', balanceEffect: '0.00', runningBalance: '60.00', status: 'VOIDED', reason: 'Wrong customer' },
    ]);
    expect(row).toMatchObject({ type: 'Payment', inactiveLabel: 'Voided', debit: null, credit: null, balance: '60.00', reason: 'Wrong customer' });
  });

  it('explains a prepaid deposit that does not change the balance', () => {
    const [row] = toCustomerStatementRows([
      { ...entry, type: 'PAYMENT', originalAmount: '150.00', balanceEffect: '0.00', runningBalance: '0.00', status: 'POSTED', reason: null },
    ]);
    expect(row.debit).toBeNull();
    expect(row.credit).toBeNull();
    expect(row.reason).toContain('$150.00');
    expect(row.reason).toContain('prepaid');
  });

  it('labels a removed supplier transaction and leaves its amounts empty', () => {
    const [row] = toSupplierStatementRows([
      { ...entry, type: 'SUPPLIER_DEBT', balanceEffect: '0.00', runningBalance: '60.00', status: 'REMOVED', reason: 'Entered twice' },
    ]);
    expect(row).toMatchObject({ type: 'Debt', inactiveLabel: 'Removed', debit: null, credit: null, reason: 'Entered twice' });
  });
});

describe('StatementTable', () => {
  const props = {
    title: 'Statement of account', explanation: 'Explained', from: '2026-01-01', to: '2026-03-31', onRangeChange: vi.fn(),
    printHref: '/suppliers/s-1/statement?from=2026-01-01&to=2026-03-31', onRetry: vi.fn(),
  };
  const render = (extra: object) => renderToStaticMarkup(<MemoryRouter><StatementTable {...props} isLoading={false} isError={false} {...extra} /></MemoryRouter>);

  it('shows the opening and closing balances around each entry, and links to print', () => {
    const html = render({
      openingBalance: '10.00', closingBalance: '110.00',
      rows: [{ id: 'r-1', date: '2026-03-05', type: 'Purchase', description: 'Stock', reference: 'INV-9', debit: null, credit: '100.00', balance: '110.00', inactiveLabel: null, reason: null }],
    });
    expect(html).toContain('Opening balance');
    expect(html).toContain('Closing balance');
    expect(html).toContain('INV-9');
    expect(html).toContain('$110.00');
    expect(html).toContain('href="/suppliers/s-1/statement?from=2026-01-01&amp;to=2026-03-31"');
  });

  it('still shows both balances when the period has no entries', () => {
    const html = render({ openingBalance: '10.00', closingBalance: '10.00', rows: [] });
    expect(html).toContain('Opening balance');
    expect(html).toContain('No entries in this period');
  });

  it('offers a retry when the statement fails to load', () => {
    expect(render({ isError: true })).toContain('Retry');
  });
});
