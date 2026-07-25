import { describe, expect, it } from 'vitest';
import { financialLedgerQueryKey } from './useFinancialLedger';

describe('financial ledger query helpers', () => {
  it('builds a stable query key with defaults and filters', () => {
    expect(financialLedgerQueryKey({ search: ' Ali ', type: 'PAYMENT' })).toEqual([
      'financial-ledger',
      {
        type: 'PAYMENT',
        status: undefined,
        customerId: undefined,
        search: 'Ali',
        dueFrom: undefined,
        dueTo: undefined,
        paymentFrom: undefined,
        paymentTo: undefined,
        includeCancelled: false,
        page: 1,
        limit: 25,
        sortBy: 'date',
        sortOrder: 'asc',
      },
    ]);
  });
});
