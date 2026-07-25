import { addMonthsToBusinessDate, isStrictBusinessDate } from './business-date';
import { centsToMoney, isValidMoneyInput, moneyToCents } from './money-input';

export interface InstallmentPreviewInput {
  totalAmount: string;
  startDate: string;
  installmentCount: number;
}

export interface InstallmentPreviewRow {
  installmentNumber: number;
  dueDate: string;
  amountDue: string;
}

export interface InstallmentPreview {
  rows: InstallmentPreviewRow[];
  totalScheduled: string;
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
  const count = BigInt(input.installmentCount);
  const baseAmount = totalCents / count;
  const rows: InstallmentPreviewRow[] = [];

  for (let index = 0; index < input.installmentCount; index += 1) {
    const isFinalInstallment = index === input.installmentCount - 1;
    const amountDue = isFinalInstallment
      ? totalCents - baseAmount * BigInt(input.installmentCount - 1)
      : baseAmount;

    rows.push({
      installmentNumber: index + 1,
      dueDate: addMonthsToBusinessDate(input.startDate, index),
      amountDue: centsToMoney(amountDue),
    });
  }

  return {
    rows,
    totalScheduled: centsToMoney(totalCents),
  };
}
