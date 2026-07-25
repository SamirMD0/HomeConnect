import { DebtStatus, InstallmentStatus } from '@prisma/client';
import { compareBusinessDates } from './business-date';
import { FinancialRecordCancelledError, OverpaymentError } from './financial-errors';
import {
  DebtAllocationInput,
  DebtPaymentAllocationInstruction,
  PlanAllocationInstallmentInput,
  PlanPaymentAllocationInstruction,
} from './financial-types';
import {
  assertPositiveMoney,
  greaterThanMoney,
  minMoney,
  parseMoney,
  subtractMoney,
  sumMoney,
  ZERO_MONEY,
} from './money';

export function planInstallmentPaymentAllocations(input: {
  paymentAmount: Parameters<typeof parseMoney>[0];
  installments: PlanAllocationInstallmentInput[];
}): PlanPaymentAllocationInstruction[] {
  const paymentAmount = assertPositiveMoney(input.paymentAmount);
  const eligibleInstallments = input.installments
    .filter((installment) => installment.status !== InstallmentStatus.CANCELLED)
    .map((installment) => ({
      ...installment,
      remainingBalance: subtractMoney(installment.amountDue, installment.amountPaid),
    }))
    .filter(
      (installment) =>
        installment.status !== InstallmentStatus.PAID &&
        installment.remainingBalance.greaterThan(ZERO_MONEY)
    )
    .sort((left, right) => {
      const dateComparison = compareBusinessDates(left.dueDate, right.dueDate);
      return dateComparison === 0 ? left.installmentNumber - right.installmentNumber : dateComparison;
    });

  const planRemainingBalance = sumMoney(
    eligibleInstallments.map((installment) => installment.remainingBalance)
  );

  if (greaterThanMoney(paymentAmount, planRemainingBalance)) {
    throw new OverpaymentError('Payment amount exceeds installment plan remaining balance');
  }

  let remainingPayment = paymentAmount;
  const allocations: PlanPaymentAllocationInstruction[] = [];

  for (const installment of eligibleInstallments) {
    if (remainingPayment.equals(ZERO_MONEY)) break;

    const allocationAmount = minMoney(remainingPayment, installment.remainingBalance);
    allocations.push({
      installmentId: installment.id,
      amount: allocationAmount,
    });
    remainingPayment = subtractMoney(remainingPayment, allocationAmount);
  }

  const allocationTotal = sumMoney(allocations.map((allocation) => allocation.amount));
  if (!allocationTotal.equals(paymentAmount)) {
    throw new OverpaymentError('Unable to allocate full payment amount');
  }

  return allocations;
}

export function planDebtPaymentAllocation(
  input: DebtAllocationInput
): DebtPaymentAllocationInstruction {
  if (input.status === DebtStatus.CANCELLED) {
    throw new FinancialRecordCancelledError('Cannot allocate payment to a cancelled debt');
  }

  const paymentAmount = assertPositiveMoney(input.paymentAmount);
  const remainingBalance = parseMoney(input.remainingBalance);

  if (greaterThanMoney(paymentAmount, remainingBalance)) {
    throw new OverpaymentError('Payment amount exceeds debt remaining balance');
  }

  return {
    debtId: input.debtId,
    amount: paymentAmount,
  };
}
