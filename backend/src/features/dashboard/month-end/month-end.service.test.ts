import { SupplierTransactionDirection, SupplierTransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { MonthEndService, reconcileMovement } from './month-end.service';

describe('month-end reconciliation', () => {
  it.each([
    ['100', '20', '10', '110'],
    ['110', '0', '0', '110'],
    ['110', '30', '25', '100'],
  ])('always exposes a balanced movement chain', (opening, added, collected, closing) => {
    const result = reconcileMovement({ opening, newAmount: added, collected, closing });
    expect(result.reconciled).toBe(true);
    expect(new Decimal(result.opening).plus(result.newAmount).minus(result.collected).plus(result.adjustments).toFixed(2)).toBe(result.closing);
  });

  it('keeps a zero-activity month opening equal to closing', () => {
    expect(reconcileMovement({ opening: '80', newAmount: '0', collected: '0', closing: '80' })).toMatchObject({ opening: '80.00', closing: '80.00', adjustments: '0.00' });
  });

  it('builds supplier and service controls without mixing customer balances', () => {
    const result = MonthEndService.aggregateOperational('2026-08', {
      supplierTransactions: [
        { id: 't', supplierId: 's', supplier: { isActive: true }, type: SupplierTransactionType.SUPPLIER_DEBT, direction: SupplierTransactionDirection.INCREASE_OWED, amount: new Decimal('50'), transactionDate: new Date('2026-08-01T00:00:00Z') },
      ],
      serviceJobs: [],
    } as never, {
      ...reconcileMovement({ opening: '10', newAmount: '0', collected: '0', closing: '10' }),
      withDebt: 1, fullyPaid: 0, overdue: 0,
    });
    expect(result.customers.closing).toBe('10.00');
    expect(result.suppliers.closing).toBe('50.00');
  });
});
