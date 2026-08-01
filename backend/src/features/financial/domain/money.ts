import { Decimal } from '@prisma/client/runtime/library';
import { InvalidMoneyError } from './financial-errors';

export type MoneyInput = string | Decimal | DecimalLike;

interface DecimalLike {
  toString: () => string;
  decimalPlaces?: () => number;
  isFinite?: () => boolean;
}

const MONEY_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const MAX_SCHEMA_MONEY = new Decimal('9999999999.99');
export const ZERO_MONEY = new Decimal('0.00');

export function parseMoney(input: MoneyInput): Decimal {
  const amount = isDecimalLike(input) ? new Decimal(input.toString()) : parseMoneyString(input);

  if (!amount.isFinite()) {
    throw new InvalidMoneyError('Money amount must be finite');
  }

  if (amount.decimalPlaces() > 2) {
    throw new InvalidMoneyError('Money amount cannot have more than 2 decimal places');
  }

  if (amount.abs().greaterThan(MAX_SCHEMA_MONEY)) {
    throw new InvalidMoneyError('Money amount exceeds supported precision');
  }

  return amount.toDecimalPlaces(2);
}

export function assertPositiveMoney(input: MoneyInput): Decimal {
  const amount = parseMoney(input);
  if (amount.lessThanOrEqualTo(ZERO_MONEY)) {
    throw new InvalidMoneyError('Money amount must be greater than zero');
  }
  return amount;
}

export function assertZeroMoney(input: MoneyInput): Decimal {
  const amount = parseMoney(input);
  if (!amount.equals(ZERO_MONEY)) {
    throw new InvalidMoneyError('Money amount must be zero');
  }
  return amount;
}

export function addMoney(left: MoneyInput, right: MoneyInput): Decimal {
  return parseMoney(left).plus(parseMoney(right)).toDecimalPlaces(2);
}

export function subtractMoney(left: MoneyInput, right: MoneyInput): Decimal {
  return parseMoney(left).minus(parseMoney(right)).toDecimalPlaces(2);
}

export function multiplyMoney(
  amount: MoneyInput,
  multiplier: string | Decimal,
  roundingMode: Decimal.Rounding = Decimal.ROUND_HALF_UP
): Decimal {
  const factor = parseFiniteDecimal(multiplier, 'Money multiplier');
  return parseMoney(amount).mul(factor).toDecimalPlaces(2, roundingMode);
}

export function divideMoney(
  amount: MoneyInput,
  divisor: string | Decimal,
  roundingMode: Decimal.Rounding = Decimal.ROUND_HALF_UP
): Decimal {
  const value = parseFiniteDecimal(divisor, 'Money divisor');
  if (value.isZero()) throw new InvalidMoneyError('Money divisor cannot be zero');
  return parseMoney(amount).div(value).toDecimalPlaces(2, roundingMode);
}

export function sumMoney(values: MoneyInput[]): Decimal {
  return values
    .reduce<Decimal>((total, value) => total.plus(parseMoney(value)), ZERO_MONEY)
    .toDecimalPlaces(2);
}

export function compareMoney(left: MoneyInput, right: MoneyInput): -1 | 0 | 1 {
  const comparison = parseMoney(left).comparedTo(parseMoney(right));
  if (comparison < 0) return -1;
  if (comparison > 0) return 1;
  return 0;
}

export function minMoney(left: MoneyInput, right: MoneyInput): Decimal {
  return compareMoney(left, right) <= 0 ? parseMoney(left) : parseMoney(right);
}

export function greaterThanMoney(left: MoneyInput, right: MoneyInput): boolean {
  return parseMoney(left).greaterThan(parseMoney(right));
}

export function greaterThanOrEqualMoney(left: MoneyInput, right: MoneyInput): boolean {
  return parseMoney(left).greaterThanOrEqualTo(parseMoney(right));
}

export function equalMoney(left: MoneyInput, right: MoneyInput): boolean {
  return parseMoney(left).equals(parseMoney(right));
}

export function isPositiveMoney(input: MoneyInput): boolean {
  return parseMoney(input).greaterThan(ZERO_MONEY);
}

export function isZeroMoney(input: MoneyInput): boolean {
  return parseMoney(input).equals(ZERO_MONEY);
}

export function moneyToApiString(input: MoneyInput): string {
  return parseMoney(input).toFixed(2);
}

export function moneyToCents(input: MoneyInput): bigint {
  const cents = parseMoney(input).mul(100);
  if (!cents.isInteger()) {
    throw new InvalidMoneyError('Money amount cannot have fractional cents');
  }
  return BigInt(cents.toFixed(0));
}

export function centsToMoney(cents: bigint): Decimal {
  return new Decimal(cents.toString()).div(100).toDecimalPlaces(2);
}

function parseMoneyString(input: string): Decimal {
  const value = input.trim();
  if (!MONEY_PATTERN.test(value)) {
    throw new InvalidMoneyError('Money amount must be a decimal string with up to 2 decimal places');
  }
  return new Decimal(value);
}

function isDecimalLike(input: MoneyInput): input is Decimal | DecimalLike {
  return typeof input === 'object' && input !== null && typeof input.toString === 'function';
}

function parseFiniteDecimal(input: string | Decimal, label: string): Decimal {
  const value = new Decimal(input.toString());
  if (!value.isFinite()) throw new InvalidMoneyError(`${label} must be finite`);
  return value;
}
