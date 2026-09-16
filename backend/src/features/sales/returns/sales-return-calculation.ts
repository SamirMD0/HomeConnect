import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ValidationError } from '../../../lib/errors';
import {
  minMoney,
  minorUnitsToMoney,
  moneyToMinorUnits,
  parseMoney,
  subtractMoney,
} from '../../financial/domain/money';

export interface ReturnComponentAllocationInput {
  originalAmount: string | Decimal;
  soldQuantity: number;
  previouslyReturnedQuantity: number;
  previouslyAllocatedAmount: string | Decimal;
  returnQuantity: number;
  currency: Currency;
}

type SnapshotAmount = string | Decimal;

export interface ReturnLineAmounts {
  discountAmount: SnapshotAmount;
  subtotalExVat: SnapshotAmount;
  vatAmount: SnapshotAmount;
  totalIncVat: SnapshotAmount;
  baseSubtotalExVat: SnapshotAmount;
  baseVatAmount: SnapshotAmount;
  baseTotalIncVat: SnapshotAmount;
}

/** Allocate immutable gross/VAT anchors; subtotal is always their remainder. */
export function allocateReturnLine(input: {
  original: ReturnLineAmounts;
  soldQuantity: number;
  returnQuantity: number;
  previousReturns: Array<ReturnLineAmounts & { quantity: number }>;
  currency: Currency;
}) {
  const previouslyReturnedQuantity = input.previousReturns.reduce((sum, prior) => sum + prior.quantity, 0);
  const allocate = (field: keyof ReturnLineAmounts, currency: Currency) => allocateReturnComponent({
    originalAmount: input.original[field],
    soldQuantity: input.soldQuantity,
    previouslyReturnedQuantity,
    previouslyAllocatedAmount: input.previousReturns.reduce((sum, prior) => sum.plus(prior[field]), new Decimal(0)),
    returnQuantity: input.returnQuantity,
    currency,
  });
  const totalIncVat = allocate('totalIncVat', input.currency);
  const vatAmount = allocate('vatAmount', input.currency);
  const baseTotalIncVat = allocate('baseTotalIncVat', Currency.USD);
  const baseVatAmount = allocate('baseVatAmount', Currency.USD);
  return {
    discountAmount: allocate('discountAmount', input.currency),
    subtotalExVat: subtractMoney(totalIncVat, vatAmount, input.currency),
    vatAmount,
    totalIncVat,
    baseSubtotalExVat: subtractMoney(baseTotalIncVat, baseVatAmount, Currency.USD),
    baseVatAmount,
    baseTotalIncVat,
  };
}

export function allocateReturnComponent(input: ReturnComponentAllocationInput): Decimal {
  if (!Number.isSafeInteger(input.soldQuantity) || input.soldQuantity <= 0) {
    throw new ValidationError('Original sold quantity must be positive');
  }
  if (!Number.isSafeInteger(input.previouslyReturnedQuantity) || input.previouslyReturnedQuantity < 0 ||
      !Number.isSafeInteger(input.returnQuantity) || input.returnQuantity <= 0 ||
      input.previouslyReturnedQuantity + input.returnQuantity > input.soldQuantity) {
    throw new ValidationError('Returned quantity exceeds the quantity originally sold');
  }

  const originalMinor = moneyToMinorUnits(input.originalAmount, input.currency);
  const cumulativeQuantity = BigInt(input.previouslyReturnedQuantity + input.returnQuantity);
  const soldQuantity = BigInt(input.soldQuantity);
  const numerator = originalMinor * cumulativeQuantity;
  const quotient = numerator / soldQuantity;
  const remainder = numerator % soldQuantity;
  const targetCumulativeMinor = quotient + (remainder * 2n >= soldQuantity ? 1n : 0n);
  const previouslyAllocatedMinor = moneyToMinorUnits(input.previouslyAllocatedAmount, input.currency);
  const thisReturnMinor = targetCumulativeMinor - previouslyAllocatedMinor;
  if (thisReturnMinor < 0n) throw new ValidationError('Prior return allocation exceeds the original snapshot');
  return minorUnitsToMoney(thisReturnMinor, input.currency);
}

export function deriveReturnSettlement(
  totalIncVat: string | Decimal,
  currentOutstanding: string | Decimal,
  currency: Currency
) {
  const total = parseMoney(totalIncVat, currency);
  const outstanding = parseMoney(currentOutstanding, currency);
  const receivableRelief = minMoney(total, outstanding, currency);
  return {
    receivableRelief,
    refundable: subtractMoney(total, receivableRelief, currency),
  };
}
