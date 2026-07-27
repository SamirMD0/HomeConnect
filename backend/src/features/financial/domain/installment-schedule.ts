import { InstallmentPlanFrequency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { addMonthsToBusinessDate, parseBusinessDate } from './business-date';
import { InstallmentScheduleError, InvalidInstallmentCountError } from './financial-errors';
import { assertPositiveMoney, centsToMoney, moneyToCents, sumMoney } from './money';
import { GeneratedInstallment, GenerateMonthlyInstallmentScheduleInput } from './financial-types';

export function generateMonthlyInstallmentSchedule(
  input: GenerateMonthlyInstallmentScheduleInput
): GeneratedInstallment[] {
  if (input.frequency !== InstallmentPlanFrequency.MONTHLY) {
    throw new InstallmentScheduleError('Only monthly installment schedules are supported');
  }

  if (!Number.isInteger(input.installmentCount) || input.installmentCount <= 0) {
    throw new InvalidInstallmentCountError('Installment count must be a positive integer');
  }

  const totalAmount = assertPositiveMoney(input.totalAmount);
  const startDate = parseBusinessDate(input.startDate);
  const totalCents = moneyToCents(totalAmount);
  const count = BigInt(input.installmentCount);

  if (totalCents < count) {
    throw new InstallmentScheduleError('Total amount is too small to create positive installments');
  }

  const useWholeDollarSplit = totalCents % 100n === 0n && totalCents / 100n >= count;
  const baseCents = useWholeDollarSplit
    ? (totalCents / 100n / count) * 100n
    : totalCents / count;
  const remainderCents = useWholeDollarSplit
    ? (totalCents / 100n) % count
    : 0n;
  const installments: GeneratedInstallment[] = [];
  let allocatedCents = 0n;

  for (let index = 0; index < input.installmentCount; index += 1) {
    const isFinalInstallment = index === input.installmentCount - 1;
    const amountCents = useWholeDollarSplit
      ? baseCents + (BigInt(index) < remainderCents ? 100n : 0n)
      : isFinalInstallment
        ? totalCents - allocatedCents
        : baseCents;

    if (amountCents <= 0n) {
      throw new InstallmentScheduleError('Installment amount must be greater than zero');
    }

    installments.push({
      installmentNumber: index + 1,
      dueDate: addMonthsToBusinessDate(startDate, index),
      amountDue: centsToMoney(amountCents),
    });

    allocatedCents += amountCents;
  }

  const generatedTotal = sumMoney(installments.map((installment) => installment.amountDue));
  if (!generatedTotal.equals(new Decimal(totalAmount))) {
    throw new InstallmentScheduleError('Generated installment total does not match plan total');
  }

  return installments;
}
