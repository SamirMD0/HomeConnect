import { describe, expect, it } from 'vitest';
import { financialLedgerQueryKey } from './useFinancialLedger';
import { buildFinancialLedgerParams } from '../utils/ledger-query';

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
        includeCompleted: false,
        correctedOnly: false,
        page: 1,
        limit: 25,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
    ]);
  });

  it('defaults hidden cancelled and completed records out of ledger requests', () => {
    expect(buildFinancialLedgerParams()).toMatchObject({
      type: 'ALL',
      includeCancelled: false,
      includeCompleted: false,
      correctedOnly: false,
      page: 1,
      limit: 25,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('trims search and keeps include completed explicit when enabled', () => {
    expect(buildFinancialLedgerParams({ search: '  Ali  ', includeCompleted: true, page: 3 })).toMatchObject({
      search: 'Ali',
      includeCompleted: true,
      includeCancelled: false,
      page: 3,
    });
  });
});
