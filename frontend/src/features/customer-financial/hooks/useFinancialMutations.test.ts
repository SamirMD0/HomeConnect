import { describe, expect, it } from 'vitest';
import { customerFinancialSummaryMutationQueryKey } from './useFinancialMutations';

describe('financial mutation query keys', () => {
  it('invalidates only the selected customer financial-summary prefix', () => {
    expect(customerFinancialSummaryMutationQueryKey('customer-1')).toEqual([
      'customers',
      'customer-1',
      'financial-summary',
    ]);
  });
});
