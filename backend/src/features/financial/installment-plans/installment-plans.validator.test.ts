import { InstallmentPlanFrequency, InstallmentPlanStatus, PaymentMethod } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  cancelInstallmentPlanSchema,
  createInstallmentPlanPaymentSchema,
  createInstallmentPlanSchema,
  installmentPlanParamsSchema,
  listCustomerInstallmentPlansQuerySchema,
} from './installment-plans.validator';

describe('installment plan validators', () => {
  it('accepts valid plan creation input and trims text', () => {
    expect(
      createInstallmentPlanSchema.parse({
        totalAmount: '600.00',
        description: ' Refrigerator ',
        startDate: '2026-08-01',
        installmentCount: 6,
        frequency: InstallmentPlanFrequency.MONTHLY,
        notes: ' Optional ',
      })
    ).toEqual({
      totalAmount: '600.00',
      description: 'Refrigerator',
      startDate: '2026-08-01',
      installmentCount: 6,
      frequency: InstallmentPlanFrequency.MONTHLY,
      notes: 'Optional',
    });
  });

  it('rejects invalid plan creation inputs and client-provided schedules/statuses', () => {
    expect(() =>
      createInstallmentPlanSchema.parse({
        totalAmount: '0.00',
        description: 'Refrigerator',
        startDate: '2026-08-01',
        installmentCount: 6,
      })
    ).toThrow();

    expect(() =>
      createInstallmentPlanSchema.parse({
        totalAmount: '-1.00',
        description: 'Refrigerator',
        startDate: '2026-08-01',
        installmentCount: 6,
      })
    ).toThrow();

    expect(() =>
      createInstallmentPlanSchema.parse({
        totalAmount: '100.001',
        description: 'Refrigerator',
        startDate: '2026-08-01',
        installmentCount: 6,
      })
    ).toThrow();

    expect(() =>
      createInstallmentPlanSchema.parse({
        totalAmount: '600.00',
        description: 'Refrigerator',
        startDate: '2026-8-01',
        installmentCount: 6,
      })
    ).toThrow();

    expect(() =>
      createInstallmentPlanSchema.parse({
        totalAmount: '600.00',
        description: 'Refrigerator',
        startDate: '2026-08-01',
        installmentCount: 0,
      })
    ).toThrow();

    expect(createInstallmentPlanSchema.parse({
      totalAmount: '600.00',
      description: 'Refrigerator',
      startDate: '2026-08-01',
      installmentCount: 6,
      frequency: 'WEEKLY',
    }).frequency).toBe('WEEKLY');

    expect(() =>
      createInstallmentPlanSchema.parse({
        totalAmount: '600.00',
        description: 'Refrigerator',
        startDate: '2026-08-01',
        installmentCount: 6,
        status: InstallmentPlanStatus.COMPLETED,
        installments: [],
      })
    ).toThrow();
  });

  it('validates plan payments, params, list query, and cancellation reason', () => {
    expect(() => installmentPlanParamsSchema.parse({ planId: 'not-a-uuid' })).toThrow();

    expect(
      createInstallmentPlanPaymentSchema.parse({
        amount: '150.00',
        paymentDate: '2026-08-15',
        paymentMethod: PaymentMethod.CASH,
        reference: ' REF ',
        idempotencyKey: ' key-12345 ',
      })
    ).toMatchObject({
      amount: '150.00',
      paymentDate: '2026-08-15',
      paymentMethod: PaymentMethod.CASH,
      reference: 'REF',
      idempotencyKey: 'key-12345',
    });

    expect(() =>
      createInstallmentPlanPaymentSchema.parse({
        amount: '150.00',
        paymentDate: '2026-08-15',
        paymentMethod: 'CHEQUE',
      })
    ).toThrow();

    expect(
      listCustomerInstallmentPlansQuerySchema.parse({
        page: '2',
        limit: '20',
        status: InstallmentPlanStatus.ACTIVE,
        includeCancelled: 'true',
        sortOrder: 'desc',
      })
    ).toEqual({
      page: 2,
      limit: 20,
      status: InstallmentPlanStatus.ACTIVE,
      includeCancelled: true,
      sortOrder: 'desc',
    });

    expect(() => cancelInstallmentPlanSchema.parse({ reason: '', accountPassword: '' })).toThrow();
    expect(
      cancelInstallmentPlanSchema.parse({ reason: ' Agreement cancelled ', accountPassword: 'admin123' })
    ).toEqual({
      reason: 'Agreement cancelled',
      accountPassword: 'admin123',
    });
  });
});
