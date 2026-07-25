import { describe, expect, it } from 'vitest';
import {
  customerFinancialSummaryParamsSchema,
  customerFinancialSummaryQuerySchema,
} from './customer-financial-summary.validator';

describe('customer financial summary validators', () => {
  it('validates customer ID params', () => {
    expect(
      customerFinancialSummaryParamsSchema.parse({
        customerId: '22222222-2222-4222-8222-222222222222',
      })
    ).toEqual({
      customerId: '22222222-2222-4222-8222-222222222222',
    });

    expect(() =>
      customerFinancialSummaryParamsSchema.parse({ customerId: 'not-a-uuid' })
    ).toThrow();
  });

  it('applies focused defaults for optional query parameters', () => {
    expect(customerFinancialSummaryQuerySchema.parse({})).toEqual({
      includeCancelled: false,
      includePayments: true,
      paymentLimit: 20,
      debtLimit: 50,
      planLimit: 50,
    });
  });

  it('coerces valid query options and rejects excessive limits', () => {
    expect(
      customerFinancialSummaryQuerySchema.parse({
        includeCancelled: 'true',
        includePayments: 'false',
        paymentLimit: '100',
        debtLimit: '75',
        planLimit: '25',
      })
    ).toEqual({
      includeCancelled: true,
      includePayments: false,
      paymentLimit: 100,
      debtLimit: 75,
      planLimit: 25,
    });

    expect(() => customerFinancialSummaryQuerySchema.parse({ paymentLimit: '101' })).toThrow();
    expect(() => customerFinancialSummaryQuerySchema.parse({ debtLimit: '0' })).toThrow();
    expect(() => customerFinancialSummaryQuerySchema.parse({ includePayments: 'yes' })).toThrow();
  });
});
