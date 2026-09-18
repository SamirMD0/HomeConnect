import { describe, expect, it } from 'vitest';
import type { SalesOrderItem } from '../types/sales-orders.types';
import { isReturnWindowExpired, returnLineBlocker, returnSubmitProblem } from './sales-return-form';

function item(overrides: Partial<SalesOrderItem> = {}): SalesOrderItem {
  return {
    id: 'item-1', quantity: 2, returnedQuantity: 0, remainingReturnableQuantity: 2,
    product: { trackStock: true }, stockFulfillments: [],
    ...overrides,
  } as unknown as SalesOrderItem;
}

const active = (quantity: number) => ({ id: 'f-1', quantity, status: 'ACTIVE' as const }) as SalesOrderItem['stockFulfillments'][number];

describe('returnLineBlocker', () => {
  it('blocks a stock-tracked line whose stock was never deducted', () => {
    expect(returnLineBlocker(item())).toContain('Deduct Stock');
  });

  it('blocks a stock-tracked line whose only fulfillment was reversed', () => {
    expect(returnLineBlocker(item({ stockFulfillments: [{ ...active(2), status: 'REVERSED' }] }))).toContain('Deduct Stock');
  });

  it('allows a stock-tracked line with one active fulfillment', () => {
    expect(returnLineBlocker(item({ stockFulfillments: [active(2)] }))).toBeNull();
  });

  it('allows untracked and manual lines without fulfillment history', () => {
    expect(returnLineBlocker(item({ product: { trackStock: false } as SalesOrderItem['product'] }))).toBeNull();
    expect(returnLineBlocker(item({ product: null }))).toBeNull();
  });
});

describe('isReturnWindowExpired', () => {
  it('is open through the deadline day and expired the day after', () => {
    expect(isReturnWindowExpired('2026-09-01T00:00:00.000Z', 14, '2026-09-15')).toBe(false);
    expect(isReturnWindowExpired('2026-09-01', 14, '2026-09-16')).toBe(true);
  });

  it('treats unknown settings as not expired so the server stays the authority', () => {
    expect(isReturnWindowExpired('2026-01-01', undefined, '2026-09-16')).toBe(false);
  });
});

describe('returnSubmitProblem', () => {
  const ready = { selectedQuantity: 1, reason: 'Faulty', password: 'secret', override: false, overrideReason: '' };

  it('accepts a complete form', () => {
    expect(returnSubmitProblem(ready)).toBeNull();
  });

  it('requires a quantity, a reason, a password and an override reason when overriding', () => {
    expect(returnSubmitProblem({ ...ready, selectedQuantity: 0 })).toContain('quantity');
    expect(returnSubmitProblem({ ...ready, reason: '  ' })).toContain('reason');
    expect(returnSubmitProblem({ ...ready, password: '' })).toContain('password');
    expect(returnSubmitProblem({ ...ready, override: true, overrideReason: ' ' })).toContain('override');
  });
});
