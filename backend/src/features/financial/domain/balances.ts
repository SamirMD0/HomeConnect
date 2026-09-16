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

export function isPaymentAllocationVoided(allocation: {
  voidedAt?: Date | string | null;
  payment?: {
    voidedAt?: Date | string | null;
  } | null;
}): boolean {
  return Boolean(allocation.voidedAt || allocation.payment?.voidedAt);
}

export function calculateDebtBalance(input: DebtBalanceInput): ObligationBalance {
  return calculateObligationBalance(input.originalAmount, input.allocations, input.credits);
}

export function calculateInstallmentBalance(input: InstallmentBalanceInput): ObligationBalance {
  return calculateObligationBalance(input.amountDue, input.allocations, input.credits);
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
        credits: installment.credits,
      }).totalPaid
    )
  );

  const totalCredits = sumMoney(input.installments.map((installment) =>
    calculateTotalPaidFromAllocations(installment.credits)
  ));
  const remainingBalance = subtractMoney(input.totalAmount, sumMoney([totalPaid, totalCredits]));
  const activeInstallments = input.installments.filter(
    (installment) => installment.status !== InstallmentStatus.CANCELLED
  );

  const completedInstallmentCount = activeInstallments.filter((installment) =>
    calculateInstallmentBalance({
      amountDue: installment.amountDue,
      allocations: installment.allocations,
      credits: installment.credits,
    }).isFullyPaid
  ).length;

  const overdueInstallmentCount = activeInstallments.filter((installment) => {
    const balance = calculateInstallmentBalance({
      amountDue: installment.amountDue,
      allocations: installment.allocations,
      credits: installment.credits,
    });
    return !balance.isFullyPaid && compareBusinessDates(installment.dueDate, businessDate) < 0;
  }).length;

  const nextDueDate = activeInstallments
    .filter((installment) => {
      const balance = calculateInstallmentBalance({
        amountDue: installment.amountDue,
        allocations: installment.allocations,
        credits: installment.credits,
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
  allocations: PaymentAllocationAmount[] = [],
  credits: PaymentAllocationAmount[] = []
): ObligationBalance {
  const originalAmount = parseMoney(originalAmountInput);
  const totalPaid = calculateTotalPaidFromAllocations(allocations);
  const totalCredits = calculateTotalPaidFromAllocations(credits);
  const totalSettled = sumMoney([totalPaid, totalCredits]);
  const remainingBalance = subtractMoney(originalAmount, totalSettled);

  return {
    totalPaid,
    totalCredits,
    totalSettled,
    remainingBalance,
    isFullyPaid: remainingBalance.equals(ZERO_MONEY),
    isPartiallyPaid: totalSettled.greaterThan(ZERO_MONEY) && remainingBalance.greaterThan(ZERO_MONEY),
  };
}
