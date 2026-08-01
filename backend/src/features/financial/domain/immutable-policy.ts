import { DebtStatus, InstallmentPlanStatus } from '@prisma/client';
import {
  FinancialRecordAlreadyPaidError,
  FinancialRecordCancelledError,
  FinancialInvariantError,
} from './financial-errors';

export const FINANCIAL_IMMUTABILITY_RULES = {
  debtsAreNotEditedAfterPayments: true,
  installmentSchedulesAreNotRegenerated: true,
  paymentsAreNeverDeleted: true,
  paymentAllocationsAreNeverEdited: true,
  correctionsUseCancellationOrVoiding: true,
  cancellationRequiresReasonUserAndTimestamp: true,
  voidingRequiresReasonUserAndTimestamp: true,
} as const;

export function assertCanCancelDebt(input: {
  status: DebtStatus;
  hasPayments: boolean;
  allowPaidOrPaymentCancellation?: boolean;
  reason?: string | null;
  cancelledById?: string | null;
}): void {
  assertReasonAndUser(input.reason, input.cancelledById, 'Debt cancellation');
  if (input.status === DebtStatus.CANCELLED) {
    throw new FinancialRecordCancelledError('Debt is already cancelled');
  }
  if (input.status === DebtStatus.PAID && !input.allowPaidOrPaymentCancellation) {
    throw new FinancialRecordAlreadyPaidError('Paid debt cannot be cancelled');
  }
  if (input.hasPayments && !input.allowPaidOrPaymentCancellation) {
    throw new FinancialInvariantError('Debt with payments requires a dedicated reversal workflow');
  }
}

export function assertCanCancelInstallmentPlan(input: {
  status: InstallmentPlanStatus;
  hasPayments: boolean;
  reason?: string | null;
  cancelledById?: string | null;
}): void {
  assertReasonAndUser(input.reason, input.cancelledById, 'Installment plan cancellation');
  if (input.status === InstallmentPlanStatus.CANCELLED) {
    throw new FinancialRecordCancelledError('Installment plan is already cancelled');
  }
  if (input.status === InstallmentPlanStatus.COMPLETED) {
    throw new FinancialRecordAlreadyPaidError('Completed installment plan cannot be cancelled');
  }
  if (input.hasPayments) {
    throw new FinancialInvariantError('Installment plan with payments requires a dedicated reversal workflow');
  }
}

export function assertCanVoidPayment(input: {
  isVoided: boolean;
  reason?: string | null;
  voidedById?: string | null;
}): void {
  assertReasonAndUser(input.reason, input.voidedById, 'Payment voiding');
  if (input.isVoided) {
    throw new FinancialRecordCancelledError('Payment is already voided');
  }
}

function assertReasonAndUser(reason: string | null | undefined, userId: string | null | undefined, action: string): void {
  if (!reason?.trim()) {
    throw new FinancialInvariantError(`${action} requires a reason`);
  }
  if (!userId) {
    throw new FinancialInvariantError(`${action} requires a user`);
  }
}
