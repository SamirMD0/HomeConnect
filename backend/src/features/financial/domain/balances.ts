import { InstallmentStatus } from '@prisma/client';
import { BusinessDate, compareBusinessDates } from './business-date';
import {
  DebtBalanceInput,
  InstallmentBalanceInput,
  InstallmentPlanSummary,
  InstallmentPlanSummaryInput,
  ObligationBalance,
  PaymentAllocationAmount,
} from './financial-types';
import { parseMoney, subtractMoney, sumMoney, ZERO_MONEY } from './money';

export function calculateTotalPaidFromAllocations(
  allocations: PaymentAllocationAmount[] = []
) {
  return sumMoney(
    allocations
      .filter((allocation) => !allocation.isVoided)
      .map((allocation) => allocation.amount)
  );
}

export function calculateDebtBalance(input: DebtBalanceInput): ObligationBalance {
  return calculateObligationBalance(input.originalAmount, input.allocations);
}

export function calculateInstallmentBalance(input: InstallmentBalanceInput): ObligationBalance {
  return calculateObligationBalance(input.amountDue, input.allocations);
}

export function calculateInstallmentPlanSummary(
  input: InstallmentPlanSummaryInput,
  businessDate: BusinessDate
): InstallmentPlanSummary {
  const totalPaid = sumMoney(
    input.installments.map((installment) =>
      calculateInstallmentBalance({
        amountDue: installment.amountDue,
        allocations: installment.allocations,
      }).totalPaid
    )
  );

  const remainingBalance = subtractMoney(input.totalAmount, totalPaid);
  const activeInstallments = input.installments.filter(
    (installment) => installment.status !== InstallmentStatus.CANCELLED
  );

  const completedInstallmentCount = activeInstallments.filter((installment) =>
    calculateInstallmentBalance({
      amountDue: installment.amountDue,
      allocations: installment.allocations,
    }).isFullyPaid
  ).length;

  const overdueInstallmentCount = activeInstallments.filter((installment) => {
    const balance = calculateInstallmentBalance({
      amountDue: installment.amountDue,
      allocations: installment.allocations,
    });
    return !balance.isFullyPaid && compareBusinessDates(installment.dueDate, businessDate) < 0;
  }).length;

  const nextDueDate = activeInstallments
    .filter((installment) => {
      const balance = calculateInstallmentBalance({
        amountDue: installment.amountDue,
        allocations: installment.allocations,
      });
      return !balance.isFullyPaid;
    })
    .map((installment) => installment.dueDate)
    .sort(compareBusinessDates)[0] ?? null;

  return {
    totalPaid,
    remainingBalance,
    completedInstallmentCount,
    overdueInstallmentCount,
    nextDueDate,
  };
}

function calculateObligationBalance(
  originalAmountInput: Parameters<typeof parseMoney>[0],
  allocations: PaymentAllocationAmount[] = []
): ObligationBalance {
  const originalAmount = parseMoney(originalAmountInput);
  const totalPaid = calculateTotalPaidFromAllocations(allocations);
  const remainingBalance = subtractMoney(originalAmount, totalPaid);

  return {
    totalPaid,
    remainingBalance,
    isFullyPaid: remainingBalance.equals(ZERO_MONEY),
    isPartiallyPaid: totalPaid.greaterThan(ZERO_MONEY) && remainingBalance.greaterThan(ZERO_MONEY),
  };
}
