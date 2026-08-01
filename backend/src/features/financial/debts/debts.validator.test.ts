import { DebtStatus, PaymentMethod } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  cancelDebtSchema,
  createDebtPaymentSchema,
  createDebtSchema,
  createPrepaidPurchaseSchema,
  debtParamsSchema,
  listCustomerDebtsQuerySchema,
} from './debts.validator';

describe('debt validators', () => {
  it('accepts valid debt creation input and trims text', () => {
    const result = createDebtSchema.parse({
      amount: '600.00',
      description: ' Refrigerator ',
      dueDate: '2026-08-10',
      notes: ' Optional ',
    });

    expect(result).toEqual({
      amount: '600.00',
      description: 'Refrigerator',
      dueDate: '2026-08-10',
      notes: 'Optional',
    });
  });

  it('rejects forbidden debt creation fields and invalid money/date values', () => {
    expect(() =>
      createDebtSchema.parse({
        amount: '0.00',
        description: 'Refrigerator',
        dueDate: '2026-08-10',
      })
    ).toThrow();

    expect(() =>
      createDebtSchema.parse({
        amount: '-1.00',
        description: 'Refrigerator',
        dueDate: '2026-08-10',
      })
    ).toThrow();

    expect(() =>
      createDebtSchema.parse({
        amount: '1.001',
        description: 'Refrigerator',
        dueDate: '2026-08-10',
      })
    ).toThrow();

    expect(() =>
      createDebtSchema.parse({
        amount: '600.00',
        description: 'Refrigerator',
        dueDate: '2026-8-10',
      })
    ).toThrow();

    expect(() =>
      createDebtSchema.parse({
        amount: '600.00',
        description: 'Refrigerator',
        dueDate: '2026-08-10',
        status: DebtStatus.PAID,
        createdById: 'client-owned',
      })
    ).toThrow();
  });

  it('validates prepaid purchase amounts and rejects overpayment', () => {
    expect(createPrepaidPurchaseSchema.parse({
      itemName: ' Air conditioner ',
      paymentAmount: '100.00',
      fullAmount: '400.00',
      notes: ' Reserved ',
    })).toEqual({
      itemName: 'Air conditioner',
      paymentAmount: '100.00',
      fullAmount: '400.00',
      notes: 'Reserved',
    });

    expect(() => createPrepaidPurchaseSchema.parse({
      itemName: 'Air conditioner',
      paymentAmount: '401.00',
      fullAmount: '400.00',
    })).toThrow('Payment cannot exceed the full amount');
  });

  it('validates payment bodies with payment method enum and idempotency key shape delegated to service', () => {
    const result = createDebtPaymentSchema.parse({
      amount: '200.00',
      paymentDate: '2026-07-24',
      paymentMethod: PaymentMethod.CASH,
      reference: ' REF ',
      idempotencyKey: ' idem-key-123 ',
    });

    expect(result).toMatchObject({
      amount: '200.00',
      paymentDate: '2026-07-24',
      paymentMethod: PaymentMethod.CASH,
      reference: 'REF',
      idempotencyKey: 'idem-key-123',
    });

    expect(() =>
      createDebtPaymentSchema.parse({
        amount: '200.00',
        paymentDate: '2026-07-24',
        paymentMethod: 'CHEQUE',
      })
    ).toThrow();
  });

  it('validates params, list query, and cancellation reason', () => {
    expect(() => debtParamsSchema.parse({ debtId: 'not-a-uuid' })).toThrow();

    expect(
      listCustomerDebtsQuerySchema.parse({
        page: '2',
        limit: '20',
        status: DebtStatus.UNPAID,
        includeCancelled: 'true',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
    ).toEqual({
      page: 2,
      limit: 20,
      status: DebtStatus.UNPAID,
      includeCancelled: true,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(() => cancelDebtSchema.parse({ reason: '', accountPassword: '' })).toThrow();
    expect(cancelDebtSchema.parse({ reason: ' Customer returned product ', accountPassword: 'admin123' })).toEqual({
      reason: 'Customer returned product',
      accountPassword: 'admin123',
    });
  });
});
