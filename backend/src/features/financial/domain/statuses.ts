import { DebtStatus, InstallmentPlanStatus, InstallmentStatus } from '@prisma/client';
import { compareBusinessDates } from './business-date';
import {
  DebtStatusInput,
  InstallmentPlanStatusInput,
  InstallmentStatusInput,
} from './financial-types';
import { ZERO_MONEY } from './money';

export function determineDebtStatus(input: DebtStatusInput): DebtStatus {
  if (input.isCancelled) return DebtStatus.CANCELLED;
  if (input.balance.remainingBalance.equals(ZERO_MONEY)) return DebtStatus.PAID;
  if (
    input.overdueEligible !== false &&
    input.balance.remainingBalance.greaterThan(ZERO_MONEY) &&
    compareBusinessDates(input.dueDate, input.businessDate) < 0
  ) {
    return DebtStatus.OVERDUE;
  }
  if (input.balance.totalPaid.greaterThan(ZERO_MONEY)) return DebtStatus.PARTIALLY_PAID;
  return DebtStatus.UNPAID;
}

export function determineInstallmentStatus(input: InstallmentStatusInput): InstallmentStatus {
  if (input.isCancelled) return InstallmentStatus.CANCELLED;
  if (input.balance.remainingBalance.equals(ZERO_MONEY)) return InstallmentStatus.PAID;
  if (
    input.balance.remainingBalance.greaterThan(ZERO_MONEY) &&
    compareBusinessDates(input.dueDate, input.businessDate) < 0
  ) {
    return InstallmentStatus.OVERDUE;
  }
  if (input.balance.totalPaid.greaterThan(ZERO_MONEY)) return InstallmentStatus.PARTIALLY_PAID;
  return InstallmentStatus.PENDING;
}

export function determineInstallmentPlanStatus(
  input: InstallmentPlanStatusInput
): InstallmentPlanStatus {
  if (input.isCancelled) return InstallmentPlanStatus.CANCELLED;

  const activeInstallments = input.installments.filter(
    (installment) => installment.status !== InstallmentStatus.CANCELLED
  );

  if (
    activeInstallments.length > 0 &&
    activeInstallments.every((installment) => installment.status === InstallmentStatus.PAID)
  ) {
    return InstallmentPlanStatus.COMPLETED;
  }

  if (activeInstallments.some((installment) => installment.status === InstallmentStatus.OVERDUE)) {
    return InstallmentPlanStatus.OVERDUE;
  }

  return InstallmentPlanStatus.ACTIVE;
}
