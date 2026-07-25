import { DebtStatus, InstallmentPlanStatus, InstallmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import {
  calculateDebtBalance,
  calculateInstallmentBalance,
  calculateInstallmentPlanSummary,
} from './balances';
import { OverpaymentError } from './financial-errors';
import { moneyToApiString } from './money';
import { planDebtPaymentAllocation, planInstallmentPaymentAllocations } from './payment-allocation';
import {
  determineDebtStatus,
  determineInstallmentPlanStatus,
  determineInstallmentStatus,
} from './statuses';

describe('financial balance helpers', () => {
  it('calculates unpaid, partial, and full debt balances while excluding voided allocations', () => {
    const unpaid = calculateDebtBalance({ originalAmount: new Decimal('100.00') });
    expect(moneyToApiString(unpaid.remainingBalance)).toBe('100.00');
    expect(unpaid.isPartiallyPaid).toBe(false);

    const partial = calculateDebtBalance({
      originalAmount: new Decimal('100.00'),
      allocations: [
        { amount: new Decimal('25.00') },
        { amount: new Decimal('10.00'), isVoided: true },
      ],
    });
    expect(moneyToApiString(partial.totalPaid)).toBe('25.00');
    expect(moneyToApiString(partial.remainingBalance)).toBe('75.00');
    expect(partial.isPartiallyPaid).toBe(true);

    const full = calculateDebtBalance({
      originalAmount: new Decimal('100.00'),
      allocations: [{ amount: new Decimal('100.00') }],
    });
    expect(full.isFullyPaid).toBe(true);
  });

  it('calculates installment balances and plan summaries', () => {
    const firstBalance = calculateInstallmentBalance({
      amountDue: new Decimal('100.00'),
      allocations: [{ amount: new Decimal('100.00') }],
    });
    expect(firstBalance.isFullyPaid).toBe(true);

    const summary = calculateInstallmentPlanSummary(
      {
        totalAmount: new Decimal('300.00'),
        installments: [
          {
            dueDate: '2026-07-01',
            amountDue: new Decimal('100.00'),
            status: InstallmentStatus.PAID,
            allocations: [{ amount: new Decimal('100.00') }],
          },
          {
            dueDate: '2026-07-15',
            amountDue: new Decimal('100.00'),
            status: InstallmentStatus.PARTIALLY_PAID,
            allocations: [{ amount: new Decimal('25.00') }],
          },
          {
            dueDate: '2026-08-01',
            amountDue: new Decimal('100.00'),
            status: InstallmentStatus.CANCELLED,
          },
        ],
      },
      '2026-07-24'
    );

    expect(moneyToApiString(summary.totalPaid)).toBe('125.00');
    expect(moneyToApiString(summary.remainingBalance)).toBe('175.00');
    expect(summary.completedInstallmentCount).toBe(1);
    expect(summary.overdueInstallmentCount).toBe(1);
    expect(summary.nextDueDate).toBe('2026-07-15');
  });
});

describe('financial status helpers', () => {
  it('determines every debt status with overdue priority over partial payment', () => {
    expect(
      determineDebtStatus({
        isCancelled: true,
        dueDate: '2026-07-01',
        businessDate: '2026-07-24',
        balance: calculateDebtBalance({ originalAmount: new Decimal('100.00') }),
      })
    ).toBe(DebtStatus.CANCELLED);

    expect(
      determineDebtStatus({
        isCancelled: false,
        dueDate: '2026-07-01',
        businessDate: '2026-07-24',
        balance: calculateDebtBalance({
          originalAmount: new Decimal('100.00'),
          allocations: [{ amount: new Decimal('100.00') }],
        }),
      })
    ).toBe(DebtStatus.PAID);

    expect(
      determineDebtStatus({
        isCancelled: false,
        dueDate: '2026-07-01',
        businessDate: '2026-07-24',
        balance: calculateDebtBalance({
          originalAmount: new Decimal('100.00'),
          allocations: [{ amount: new Decimal('25.00') }],
        }),
      })
    ).toBe(DebtStatus.OVERDUE);

    expect(
      determineDebtStatus({
        isCancelled: false,
        dueDate: '2026-08-01',
        businessDate: '2026-07-24',
        balance: calculateDebtBalance({
          originalAmount: new Decimal('100.00'),
          allocations: [{ amount: new Decimal('25.00') }],
        }),
      })
    ).toBe(DebtStatus.PARTIALLY_PAID);

    expect(
      determineDebtStatus({
        isCancelled: false,
        dueDate: '2026-08-01',
        businessDate: '2026-07-24',
        balance: calculateDebtBalance({ originalAmount: new Decimal('100.00') }),
      })
    ).toBe(DebtStatus.UNPAID);
  });

  it('determines every installment status', () => {
    const pendingBalance = calculateInstallmentBalance({ amountDue: new Decimal('100.00') });
    const partialBalance = calculateInstallmentBalance({
      amountDue: new Decimal('100.00'),
      allocations: [{ amount: new Decimal('25.00') }],
    });
    const paidBalance = calculateInstallmentBalance({
      amountDue: new Decimal('100.00'),
      allocations: [{ amount: new Decimal('100.00') }],
    });

    expect(
      determineInstallmentStatus({
        isCancelled: true,
        dueDate: '2026-07-01',
        businessDate: '2026-07-24',
        balance: pendingBalance,
      })
    ).toBe(InstallmentStatus.CANCELLED);
    expect(
      determineInstallmentStatus({
        isCancelled: false,
        dueDate: '2026-07-01',
        businessDate: '2026-07-24',
        balance: paidBalance,
      })
    ).toBe(InstallmentStatus.PAID);
    expect(
      determineInstallmentStatus({
        isCancelled: false,
        dueDate: '2026-07-01',
        businessDate: '2026-07-24',
        balance: partialBalance,
      })
    ).toBe(InstallmentStatus.OVERDUE);
    expect(
      determineInstallmentStatus({
        isCancelled: false,
        dueDate: '2026-08-01',
        businessDate: '2026-07-24',
        balance: partialBalance,
      })
    ).toBe(InstallmentStatus.PARTIALLY_PAID);
    expect(
      determineInstallmentStatus({
        isCancelled: false,
        dueDate: '2026-08-01',
        businessDate: '2026-07-24',
        balance: pendingBalance,
      })
    ).toBe(InstallmentStatus.PENDING);
  });

  it('determines every installment plan status', () => {
    expect(
      determineInstallmentPlanStatus({
        isCancelled: true,
        installments: [{ status: InstallmentStatus.PENDING }],
      })
    ).toBe(InstallmentPlanStatus.CANCELLED);
    expect(
      determineInstallmentPlanStatus({
        isCancelled: false,
        installments: [{ status: InstallmentStatus.PAID }, { status: InstallmentStatus.PAID }],
      })
    ).toBe(InstallmentPlanStatus.COMPLETED);
    expect(
      determineInstallmentPlanStatus({
        isCancelled: false,
        installments: [{ status: InstallmentStatus.PAID }, { status: InstallmentStatus.OVERDUE }],
      })
    ).toBe(InstallmentPlanStatus.OVERDUE);
    expect(
      determineInstallmentPlanStatus({
        isCancelled: false,
        installments: [{ status: InstallmentStatus.PENDING }],
      })
    ).toBe(InstallmentPlanStatus.ACTIVE);
  });
});

describe('payment allocation planners', () => {
  it('allocates one installment payment', () => {
    const allocations = planInstallmentPaymentAllocations({
      paymentAmount: '50.00',
      installments: [
        {
          id: 'august',
          dueDate: '2026-08-01',
          installmentNumber: 1,
          amountDue: new Decimal('100.00'),
          amountPaid: new Decimal('0.00'),
          status: InstallmentStatus.PENDING,
        },
      ],
    });

    expect(allocations).toHaveLength(1);
    expect(allocations[0].installmentId).toBe('august');
    expect(moneyToApiString(allocations[0].amount)).toBe('50.00');
  });

  it('allocates oldest installments first and supports partial allocation across multiple rows', () => {
    const allocations = planInstallmentPaymentAllocations({
      paymentAmount: '150.00',
      installments: [
        {
          id: 'september',
          dueDate: '2026-09-01',
          installmentNumber: 2,
          amountDue: new Decimal('100.00'),
          amountPaid: new Decimal('0.00'),
          status: InstallmentStatus.PENDING,
        },
        {
          id: 'august',
          dueDate: '2026-08-01',
          installmentNumber: 1,
          amountDue: new Decimal('100.00'),
          amountPaid: new Decimal('0.00'),
          status: InstallmentStatus.PENDING,
        },
      ],
    });

    expect(allocations.map((allocation) => allocation.installmentId)).toEqual(['august', 'september']);
    expect(allocations.map((allocation) => moneyToApiString(allocation.amount))).toEqual([
      '100.00',
      '50.00',
    ]);
  });

  it('skips paid and cancelled installments and tie-breaks same due dates by installment number', () => {
    const allocations = planInstallmentPaymentAllocations({
      paymentAmount: '75.25',
      installments: [
        {
          id: 'cancelled',
          dueDate: '2026-08-01',
          installmentNumber: 1,
          amountDue: new Decimal('100.00'),
          amountPaid: new Decimal('0.00'),
          status: InstallmentStatus.CANCELLED,
        },
        {
          id: 'paid',
          dueDate: '2026-08-01',
          installmentNumber: 2,
          amountDue: new Decimal('100.00'),
          amountPaid: new Decimal('100.00'),
          status: InstallmentStatus.PAID,
        },
        {
          id: 'third',
          dueDate: '2026-08-01',
          installmentNumber: 3,
          amountDue: new Decimal('100.00'),
          amountPaid: new Decimal('50.00'),
          status: InstallmentStatus.PARTIALLY_PAID,
        },
        {
          id: 'fourth',
          dueDate: '2026-08-01',
          installmentNumber: 4,
          amountDue: new Decimal('100.00'),
          amountPaid: new Decimal('0.00'),
          status: InstallmentStatus.PENDING,
        },
      ],
    });

    expect(allocations.map((allocation) => allocation.installmentId)).toEqual(['third', 'fourth']);
    expect(allocations.map((allocation) => moneyToApiString(allocation.amount))).toEqual([
      '50.00',
      '25.25',
    ]);
  });

  it('rejects installment overpayment and zero payments', () => {
    const installments = [
      {
        id: 'only',
        dueDate: '2026-08-01',
        installmentNumber: 1,
        amountDue: new Decimal('100.00'),
        amountPaid: new Decimal('0.00'),
        status: InstallmentStatus.PENDING,
      },
    ];

    expect(() => planInstallmentPaymentAllocations({ paymentAmount: '100.01', installments })).toThrow(
      OverpaymentError
    );
    expect(() => planInstallmentPaymentAllocations({ paymentAmount: '0.00', installments })).toThrow();
  });

  it('plans simple debt allocation and rejects debt overpayment', () => {
    const allocation = planDebtPaymentAllocation({
      debtId: 'debt-id',
      paymentAmount: '20.20',
      remainingBalance: new Decimal('50.50'),
    });

    expect(allocation.debtId).toBe('debt-id');
    expect(moneyToApiString(allocation.amount)).toBe('20.20');

    expect(() =>
      planDebtPaymentAllocation({
        debtId: 'debt-id',
        paymentAmount: '50.51',
        remainingBalance: new Decimal('50.50'),
      })
    ).toThrow(OverpaymentError);
  });
});
