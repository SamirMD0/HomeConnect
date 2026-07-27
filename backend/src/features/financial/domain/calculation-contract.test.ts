import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import {
  calculateTotalPaidFromAllocations,
  isPaymentAllocationVoided,
} from './balances';
import { moneyToApiString } from './money';

describe('Phase 12 calculation contract', () => {
  it('derives paid totals from non-voided allocations only', () => {
    const totalPaid = calculateTotalPaidFromAllocations([
      { amount: new Decimal('100.00') },
      { amount: new Decimal('25.00'), isVoided: true },
      { amount: new Decimal('50.00'), isVoided: false },
    ]);

    expect(moneyToApiString(totalPaid)).toBe('150.00');
  });

  it('treats allocation or parent payment void state as voided', () => {
    expect(isPaymentAllocationVoided({ payment: { voidedAt: null } })).toBe(false);
    expect(isPaymentAllocationVoided({ payment: { voidedAt: new Date('2026-07-27T00:00:00.000Z') } })).toBe(true);
    expect(isPaymentAllocationVoided({ voidedAt: new Date('2026-07-27T00:00:00.000Z'), payment: { voidedAt: null } })).toBe(true);
  });
});
