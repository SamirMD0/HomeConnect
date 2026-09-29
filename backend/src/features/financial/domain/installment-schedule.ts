import { Currency, InstallmentPlanFrequency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { addMonthsToBusinessDate, addWeeksToBusinessDate, parseBusinessDate } from './business-date';
import { InstallmentScheduleError, InvalidInstallmentCountError } from './financial-errors';
import { assertPositiveMoney, minorUnitsToMoney, moneyToMinorUnits, sumMoney } from './money';
import { GeneratedInstallment, GenerateMonthlyInstallmentScheduleInput } from './financial-types';

export function generateMonthlyInstallmentSchedule(
  input: GenerateMonthlyInstallmentScheduleInput
): GeneratedInstallment[] {
  if (!Number.isInteger(input.installmentCount) || input.installmentCount <= 0) {
    throw new InvalidInstallmentCountError('Installment count must be a positive integer');
  }

  const currency = input.currency ?? Currency.USD;
  const totalAmount = assertPositiveMoney(input.totalAmount, currency);
  const startDate = parseBusinessDate(input.startDate);
  const totalCents = moneyToMinorUnits(totalAmount, currency);
  const count = BigInt(input.installmentCount);

  if (totalCents < count) {
    throw new InstallmentScheduleError('Total amount is too small to create positive installments');
  }

  const useWholeDollarSplit = currency === Currency.USD && totalCents % 100n === 0n && totalCents / 100n >= count;
  const baseCents = useWholeDollarSplit
    ? (totalCents / 100n / count) * 100n
    : totalCents / count;
  const remainderCents = useWholeDollarSplit
    ? (totalCents / 100n) % count
    : currency === Currency.LBP ? totalCents % count : 0n;
  const installments: GeneratedInstallment[] = [];
  let allocatedCents = 0n;

  for (let index = 0; index < input.installmentCount; index += 1) {
    const isFinalInstallment = index === input.installmentCount - 1;
    const amountCents = useWholeDollarSplit
      ? baseCents + (BigInt(index) < remainderCents ? 100n : 0n)
      : currency === Currency.LBP
        ? baseCents + (BigInt(index) < remainderCents ? 1n : 0n)
        : isFinalInstallment
          ? totalCents - allocatedCents
          : baseCents;

    if (amountCents <= 0n) {
      throw new InstallmentScheduleError('Installment amount must be greater than zero');
    }

    installments.push({
      installmentNumber: index + 1,
      dueDate: installmentDueDate(startDate, index, input.frequency),
      amountDue: minorUnitsToMoney(amountCents, currency),
    });

    allocatedCents += amountCents;
  }

  const generatedTotal = sumMoney(installments.map((installment) => installment.amountDue), currency);
  if (!generatedTotal.equals(new Decimal(totalAmount))) {
    throw new InstallmentScheduleError('Generated installment total does not match plan total');
  }

  return installments;
}

export function installmentDueDate(
  startDate: string,
  installmentIndex: number,
  frequency: InstallmentPlanFrequency
): string {
  if (frequency === InstallmentPlanFrequency.MONTHLY) {
    return addMonthsToBusinessDate(startDate, installmentIndex);
  }
  if (frequency === InstallmentPlanFrequency.WEEKLY) {
    return addWeeksToBusinessDate(startDate, installmentIndex);
  }
  throw new InstallmentScheduleError('Unsupported installment frequency');
}
