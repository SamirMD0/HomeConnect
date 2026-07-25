import { describe, expect, it } from 'vitest';
import {
  customerFinancialSummaryQueryKey,
  isCustomerFinancialSummaryQueryEnabled,
} from './useCustomerFinancialSummary';

describe('useCustomerFinancialSummary helpers', () => {
  it('builds a stable query key containing customer ID and summary options', () => {
    expect(
      customerFinancialSummaryQueryKey('customer-1', {
        includeCancelled: true,
        includePayments: false,
        paymentLimit: 10,
        debtLimit: 11,
        planLimit: 12,
      })
    ).toEqual([
      'customers',
      'customer-1',
      'financial-summary',
      {
        includeCancelled: true,
        includePayments: false,
        paymentLimit: 10,
        debtLimit: 11,
        planLimit: 12,
      },
    ]);
  });

  it('uses endpoint defaults in the query key and disables when customer ID is missing', () => {
    expect(customerFinancialSummaryQueryKey('customer-1')).toEqual([
      'customers',
      'customer-1',
      'financial-summary',
      {
        includeCancelled: false,
        includePayments: true,
        paymentLimit: 20,
        debtLimit: 50,
        planLimit: 50,
      },
    ]);
    expect(isCustomerFinancialSummaryQueryEnabled(undefined)).toBe(false);
    expect(isCustomerFinancialSummaryQueryEnabled('customer-1')).toBe(true);
  });
});
