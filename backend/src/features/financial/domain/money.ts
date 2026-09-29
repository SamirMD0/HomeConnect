import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
export { Decimal } from '@prisma/client/runtime/library';
import { InvalidMoneyError } from './financial-errors';

export type MoneyInput = string | Decimal | DecimalLike;
export type MoneyCurrency = Currency;
export type CurrencyScale = 0 | 2;

interface DecimalLike {
  toString: () => string;
  decimalPlaces?: () => number;
  isFinite?: () => boolean;
}

const MONEY_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const MAX_SCHEMA_MONEY = new Decimal('9999999999.99');
const MAX_SCHEMA_EXCHANGE_RATE = new Decimal('999999999999.999999');
export const ZERO_MONEY = new Decimal('0.00');

export function currencyScale(currency: MoneyCurrency): CurrencyScale {
  return currency === Currency.LBP ? 0 : 2;
}

export function parseMoney(input: MoneyInput, currency: MoneyCurrency = Currency.USD): Decimal {
  const amount = isDecimalLike(input) ? new Decimal(input.toString()) : parseMoneyString(input);
  if (!amount.isFinite()) throw new InvalidMoneyError('Money amount must be finite');
  if (amount.decimalPlaces() > 2) {
    throw new InvalidMoneyError('Money amount cannot have more than 2 decimal places');
  }
  if (currency === Currency.LBP && !amount.isInteger()) {
    throw new InvalidMoneyError('LBP money amount must be a whole number');
  }
  assertSupportedPrecision(amount);
  return amount.toDecimalPlaces(currencyScale(currency));
}

export function roundMoney(
  input: MoneyInput,
  currency: MoneyCurrency,
  roundingMode: Decimal.Rounding
): Decimal {
  const rounded = parseFiniteMoneyDecimal(input).toDecimalPlaces(currencyScale(currency), roundingMode);
  assertSupportedPrecision(rounded);
  return rounded;
}

export function assertPositiveMoney(input: MoneyInput, currency: MoneyCurrency = Currency.USD): Decimal {
  const amount = parseMoney(input, currency);
  if (amount.lessThanOrEqualTo(ZERO_MONEY)) {
    throw new InvalidMoneyError('Money amount must be greater than zero');
  }
  return amount;
}

export function assertZeroMoney(input: MoneyInput, currency: MoneyCurrency = Currency.USD): Decimal {
  const amount = parseMoney(input, currency);
  if (!amount.equals(ZERO_MONEY)) throw new InvalidMoneyError('Money amount must be zero');
  return amount;
}

export function addMoney(left: MoneyInput, right: MoneyInput, currency: MoneyCurrency = Currency.USD): Decimal {
  return roundMoney(parseMoney(left, currency).plus(parseMoney(right, currency)), currency, Decimal.ROUND_HALF_UP);
}

export function subtractMoney(left: MoneyInput, right: MoneyInput, currency: MoneyCurrency = Currency.USD): Decimal {
  return roundMoney(parseMoney(left, currency).minus(parseMoney(right, currency)), currency, Decimal.ROUND_HALF_UP);
}

export function multiplyMoney(
  amount: MoneyInput,
  multiplier: string | Decimal,
  currency: MoneyCurrency,
  roundingMode: Decimal.Rounding
): Decimal {
  const factor = parseFiniteDecimal(multiplier, 'Money multiplier');
  return roundMoney(parseMoney(amount, currency).mul(factor), currency, roundingMode);
}

export function divideMoney(
  amount: MoneyInput,
  divisor: string | Decimal,
  currency: MoneyCurrency,
  roundingMode: Decimal.Rounding
): Decimal {
  const value = parseFiniteDecimal(divisor, 'Money divisor');
  if (value.isZero()) throw new InvalidMoneyError('Money divisor cannot be zero');
  return roundMoney(parseMoney(amount, currency).div(value), currency, roundingMode);
}

export function sumMoney(values: MoneyInput[], currency: MoneyCurrency = Currency.USD): Decimal {
  return values
    .reduce<Decimal>((total, value) => total.plus(parseMoney(value, currency)), ZERO_MONEY)
    .toDecimalPlaces(currencyScale(currency));
}

export function compareMoney(left: MoneyInput, right: MoneyInput, currency: MoneyCurrency = Currency.USD): -1 | 0 | 1 {
  const comparison = parseMoney(left, currency).comparedTo(parseMoney(right, currency));
  if (comparison < 0) return -1;
  if (comparison > 0) return 1;
  return 0;
}

export function minMoney(left: MoneyInput, right: MoneyInput, currency: MoneyCurrency = Currency.USD): Decimal {
  return compareMoney(left, right, currency) <= 0 ? parseMoney(left, currency) : parseMoney(right, currency);
}

export function greaterThanMoney(left: MoneyInput, right: MoneyInput, currency: MoneyCurrency = Currency.USD): boolean {
  return parseMoney(left, currency).greaterThan(parseMoney(right, currency));
}

export function greaterThanOrEqualMoney(left: MoneyInput, right: MoneyInput, currency: MoneyCurrency = Currency.USD): boolean {
  return parseMoney(left, currency).greaterThanOrEqualTo(parseMoney(right, currency));
}

export function equalMoney(left: MoneyInput, right: MoneyInput, currency: MoneyCurrency = Currency.USD): boolean {
  return parseMoney(left, currency).equals(parseMoney(right, currency));
}

export function isPositiveMoney(input: MoneyInput, currency: MoneyCurrency = Currency.USD): boolean {
  return parseMoney(input, currency).greaterThan(ZERO_MONEY);
}

export function isZeroMoney(input: MoneyInput, currency: MoneyCurrency = Currency.USD): boolean {
  return parseMoney(input, currency).equals(ZERO_MONEY);
}

export function toBaseAmount(
  amount: MoneyInput,
  currency: MoneyCurrency,
  exchangeRate: string | Decimal,
  roundingMode: Decimal.Rounding
): Decimal {
  const rate = parseExchangeRate(exchangeRate);
  if (currency === Currency.USD) {
    assertUsdExchangeRate(rate);
    return parseMoney(amount, Currency.USD);
  }
  return roundMoney(parseMoney(amount, Currency.LBP).div(rate), Currency.USD, roundingMode);
}

export function fromBaseAmount(
  baseAmount: MoneyInput,
  currency: MoneyCurrency,
  exchangeRate: string | Decimal,
  roundingMode: Decimal.Rounding
): Decimal {
  const rate = parseExchangeRate(exchangeRate);
  const base = parseMoney(baseAmount, Currency.USD);
  if (currency === Currency.USD) {
    assertUsdExchangeRate(rate);
    return base;
  }
  return roundMoney(base.mul(rate), Currency.LBP, roundingMode);
}

export function moneyToApiString(input: MoneyInput, currency: MoneyCurrency = Currency.USD): string {
  return parseMoney(input, currency).toFixed(currencyScale(currency));
}

export function moneyToMinorUnits(input: MoneyInput, currency: MoneyCurrency = Currency.USD): bigint {
  const units = parseMoney(input, currency).mul(currency === Currency.USD ? 100 : 1);
  return BigInt(units.toFixed(0));
}

export function minorUnitsToMoney(units: bigint, currency: MoneyCurrency = Currency.USD): Decimal {
  return new Decimal(units.toString())
    .div(currency === Currency.USD ? 100 : 1)
    .toDecimalPlaces(currencyScale(currency));
}

/** @deprecated Use moneyToMinorUnits; retained for existing USD callers. */
export function moneyToCents(input: MoneyInput): bigint {
  return moneyToMinorUnits(input, Currency.USD);
}

/** @deprecated Use minorUnitsToMoney; retained for existing USD callers. */
export function centsToMoney(cents: bigint): Decimal {
  return minorUnitsToMoney(cents, Currency.USD);
}

export function parseExchangeRate(input: string | Decimal): Decimal {
  const rate = parseFiniteDecimal(input, 'Exchange rate');
  if (rate.lessThanOrEqualTo(0)) throw new InvalidMoneyError('Exchange rate must be greater than zero');
  if (rate.decimalPlaces() > 6) throw new InvalidMoneyError('Exchange rate cannot have more than 6 decimal places');
  if (rate.greaterThan(MAX_SCHEMA_EXCHANGE_RATE)) throw new InvalidMoneyError('Exchange rate exceeds supported precision');
  return rate.toDecimalPlaces(6);
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

function parseFiniteMoneyDecimal(input: MoneyInput): Decimal {
  const value = new Decimal(input.toString());
  if (!value.isFinite()) throw new InvalidMoneyError('Money amount must be finite');
  return value;
}

function assertSupportedPrecision(amount: Decimal): void {
  if (amount.abs().greaterThan(MAX_SCHEMA_MONEY)) {
    throw new InvalidMoneyError('Money amount exceeds supported precision');
  }
}

function assertUsdExchangeRate(rate: Decimal): void {
  if (!rate.equals(1)) throw new InvalidMoneyError('USD exchange rate must be 1');
}
