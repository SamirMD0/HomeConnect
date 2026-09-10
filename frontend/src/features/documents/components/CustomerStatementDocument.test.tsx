import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BusinessSettings, CustomerStatement } from '../types/document.types';
import { CustomerStatementDocument } from './CustomerStatementDocument';

const business: BusinessSettings = { id: 'primary', shopName: 'Home Connect', address: 'Beirut', phone: '01', taxNumber: 'VAT-1', logoUrl: null, email: null, updatedAt: null };
const statement: CustomerStatement = {
  businessDate: '2026-01-31', currency: 'USD', customer: { id: 'c1', name: 'علي الحاج', phone: '70', address: 'بيروت' },
  range: { from: '2026-01-01', to: '2026-01-31' }, openingBalance: '25.00', closingBalance: '75.00',
  entries: [
    { id: 'd1', type: 'DEBT', date: '2026-01-02', description: 'Television', reference: 'SO-1', originalAmount: '100.00', currency: 'USD', exchangeRate: '1', baseAmount: '100.00', balanceEffect: '100.00', runningBalance: '125.00', status: 'POSTED', dueDate: '2026-02-01', reason: null },
    { id: 'p1', type: 'PAYMENT', date: '2026-01-03', description: 'Payment · CASH', reference: null, originalAmount: '50.00', currency: 'USD', exchangeRate: '1', baseAmount: '50.00', balanceEffect: '-50.00', runningBalance: '75.00', status: 'POSTED', dueDate: null, reason: null },
    { id: 'p2', type: 'PAYMENT', date: '2026-01-04', description: 'Payment · CASH', reference: null, originalAmount: '10.00', currency: 'USD', exchangeRate: '1', baseAmount: '0.00', balanceEffect: '0.00', runningBalance: '75.00', status: 'VOIDED', dueDate: null, reason: 'Duplicate' },
  ],
  aging: { asOf: '2026-01-31', total: '75.00', buckets: [{ key: 'DAYS_15_30', label: '15–30 days / ١٥–٣٠ يوم', amount: '75.00' }] },
};

describe('CustomerStatementDocument', () => {
  it('prints bilingual transaction-derived balances and aging without client calculation', () => {
    const html = renderToStaticMarkup(<CustomerStatementDocument statement={statement} business={business} />);
    expect(html).toMatchSnapshot();
    expect(html).toContain('Customer statement');
    expect(html).toContain('كشف حساب زبون');
    expect(html).toContain('data-api-field="openingBalance" data-api-value="25.00"');
    expect(html).toContain('entries.d1.runningBalance');
    expect(html).toContain('data-api-value="125.00"');
    expect(html).toContain('VOID / ملغاة');
    expect(html).toContain('Aging summary');
  });
});
