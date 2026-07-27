import { addMonthsToBusinessDate, isStrictBusinessDate } from './business-date';
import { centsToMoney, isValidMoneyInput, moneyToCents } from './money-input';

export interface InstallmentPreviewInput {
  totalAmount: string;
  startDate: string;
  installmentCount: number;
  manualAmounts?: string[];
}

export interface InstallmentPreviewRow {
  installmentNumber: number;
  dueDate: string;
  amountDue: string;
}

export interface InstallmentPreview {
  rows: InstallmentPreviewRow[];
  totalScheduled: string;
  expectedTotal: string;
  balanceDifference: string;
  isBalanced: boolean;
  mode: 'AUTO' | 'MANUAL';
}

export function generateInstallmentPreview(input: InstallmentPreviewInput): InstallmentPreview {
  if (!isValidMoneyInput(input.totalAmount)) {
    throw new Error('Enter a valid total amount.');
  }
  if (!isStrictBusinessDate(input.startDate)) {
    throw new Error('Enter a valid start date.');
  }
  if (!Number.isInteger(input.installmentCount) || input.installmentCount < 1) {
    throw new Error('Installment count must be a positive whole number.');
  }

  const totalCents = moneyToCents(input.totalAmount);
  const manualAmounts = input.manualAmounts;
  const rows: InstallmentPreviewRow[] = [];

  if (manualAmounts) {
    if (manualAmounts.length !== input.installmentCount) {
      throw new Error('Manual schedule must have one amount for each installment.');
    }

    for (let index = 0; index < input.installmentCount; index += 1) {
      const amount = manualAmounts[index] ?? '';
      if (!isValidMoneyInput(amount)) {
        throw new Error(`Installment ${index + 1} needs a valid positive amount.`);
      }

      rows.push({
        installmentNumber: index + 1,
        dueDate: addMonthsToBusinessDate(input.startDate, index),
        amountDue: centsToMoney(moneyToCents(amount)),
      });
    }
  } else {
    const count = BigInt(input.installmentCount);
    const useWholeDollarSplit = totalCents % 100n === 0n && totalCents / 100n >= count;
    const baseAmount = useWholeDollarSplit
      ? (totalCents / 100n / count) * 100n
      : totalCents / count;
    const remainderDollars = useWholeDollarSplit ? (totalCents / 100n) % count : 0n;

    for (let index = 0; index < input.installmentCount; index += 1) {
      const isFinalInstallment = index === input.installmentCount - 1;
      const amountDue = useWholeDollarSplit
        ? baseAmount + (BigInt(index) < remainderDollars ? 100n : 0n)
        : isFinalInstallment
          ? totalCents - baseAmount * BigInt(input.installmentCount - 1)
          : baseAmount;

      rows.push({
        installmentNumber: index + 1,
        dueDate: addMonthsToBusinessDate(input.startDate, index),
        amountDue: centsToMoney(amountDue),
      });
    }
  }

  const scheduledCents = rows.reduce((total, row) => total + moneyToCents(row.amountDue), 0n);
  const difference = totalCents >= scheduledCents ? totalCents - scheduledCents : scheduledCents - totalCents;

  return {
    rows,
    totalScheduled: centsToMoney(scheduledCents),
    expectedTotal: centsToMoney(totalCents),
    balanceDifference: centsToMoney(difference),
    isBalanced: scheduledCents === totalCents,
    mode: manualAmounts ? 'MANUAL' : 'AUTO',
  };
}
