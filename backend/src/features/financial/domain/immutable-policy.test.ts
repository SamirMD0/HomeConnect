import { DebtStatus, InstallmentPlanStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  FinancialRecordAlreadyPaidError,
  FinancialRecordCancelledError,
  FinancialInvariantError,
} from './financial-errors';
import {
  assertCanCancelDebt,
  assertCanCancelInstallmentPlan,
  assertCanVoidPayment,
} from './immutable-policy';

describe('financial immutability policy', () => {
  it('requires reason and user metadata for cancellation and voiding', () => {
    expect(() =>
      assertCanCancelDebt({
        status: DebtStatus.UNPAID,
        hasPayments: false,
        reason: '',
        cancelledById: 'admin-id',
      })
    ).toThrow(FinancialInvariantError);

    expect(() =>
      assertCanVoidPayment({
        isVoided: false,
        reason: 'duplicate receipt',
        voidedById: null,
      })
    ).toThrow(FinancialInvariantError);
  });

  it('blocks already cancelled or paid debt cancellation', () => {
    expect(() =>
      assertCanCancelDebt({
        status: DebtStatus.CANCELLED,
        hasPayments: false,
        reason: 'customer returned item',
        cancelledById: 'admin-id',
      })
    ).toThrow(FinancialRecordCancelledError);

    expect(() =>
      assertCanCancelDebt({
        status: DebtStatus.PAID,
        hasPayments: true,
        reason: 'customer returned item',
        cancelledById: 'admin-id',
      })
    ).toThrow(FinancialRecordAlreadyPaidError);
  });

  it('allows prepaid debt cancellation with payments when the caller explicitly permits it', () => {
    expect(() =>
      assertCanCancelDebt({
        status: DebtStatus.PARTIALLY_PAID,
        hasPayments: true,
        allowPaidOrPaymentCancellation: true,
        reason: 'customer cancelled reserved item',
        cancelledById: 'admin-id',
      })
    ).not.toThrow();

    expect(() =>
      assertCanCancelDebt({
        status: DebtStatus.PAID,
        hasPayments: true,
        allowPaidOrPaymentCancellation: true,
        reason: 'customer cancelled reserved item',
        cancelledById: 'admin-id',
      })
    ).not.toThrow();
  });

  it('blocks completed installment plan cancellation and repeated payment voiding', () => {
    expect(() =>
      assertCanCancelInstallmentPlan({
        status: InstallmentPlanStatus.COMPLETED,
        hasPayments: true,
        reason: 'wrong plan',
        cancelledById: 'admin-id',
      })
    ).toThrow(FinancialRecordAlreadyPaidError);

    expect(() =>
      assertCanVoidPayment({
        isVoided: true,
        reason: 'duplicate receipt',
        voidedById: 'admin-id',
      })
    ).toThrow(FinancialRecordCancelledError);
  });
});
