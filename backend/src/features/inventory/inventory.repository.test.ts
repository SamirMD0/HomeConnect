import { describe, expect, it } from 'vitest';
import { classifyStockIntegrity } from './inventory.repository';

const base = {
  trackStock: false,
  stockQuantity: 0,
  movementCount: 0,
  ledgerSum: 0,
  hasOpeningBalance: false,
  lastQuantityAfter: null,
};

describe('inventory integrity classification', () => {
  it('keeps normal untracked zero-stock products out of the onboarding queue', () => {
    expect(classifyStockIntegrity(base)).toBe('NOT_IN_INVENTORY');
  });

  it('marks tracked or quantity-carrying products with no movements as pending', () => {
    expect(classifyStockIntegrity({ ...base, trackStock: true })).toBe('PENDING_ONBOARDING');
    expect(classifyStockIntegrity({ ...base, stockQuantity: 3 })).toBe('PENDING_ONBOARDING');
  });

  it('classifies matching opening ledgers as OK and all inconsistent ledgers as mismatch', () => {
    expect(classifyStockIntegrity({ ...base, trackStock: true, stockQuantity: 3, movementCount: 1, ledgerSum: 3, hasOpeningBalance: true, lastQuantityAfter: 3 })).toBe('OK');
    expect(classifyStockIntegrity({ ...base, trackStock: true, stockQuantity: 3, movementCount: 1, ledgerSum: 2, hasOpeningBalance: true, lastQuantityAfter: 2 })).toBe('MISMATCH');
    expect(classifyStockIntegrity({ ...base, trackStock: true, stockQuantity: 3, movementCount: 1, ledgerSum: 3, hasOpeningBalance: false, lastQuantityAfter: 3 })).toBe('MISMATCH');
  });
});
