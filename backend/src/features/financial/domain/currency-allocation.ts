import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { fromBaseAmount, parseExchangeRate, parseMoney, subtractMoney, toBaseAmount } from './money';

export interface ConvertedPaymentAllocation {
  amount: Decimal;
  paymentAmount: Decimal;
  exchangeRate: Decimal;
}

export function splitPaymentAmounts(input: {
  obligationAmounts: Decimal[];
  totalPaymentAmount: string | Decimal;
  paymentCurrency: Currency;
  obligationCurrency: Currency;
  exchangeRate: string | Decimal;
}): Decimal[] {
  if (input.obligationAmounts.length === 0) return [];
  const total = parseMoney(input.totalPaymentAmount, input.paymentCurrency);
  const rate = input.paymentCurrency === input.obligationCurrency
    ? new Decimal(1)
    : parseExchangeRate(input.exchangeRate);
  const results: Decimal[] = [];

  for (let index = 0; index < input.obligationAmounts.length; index += 1) {
    if (index === input.obligationAmounts.length - 1) {
      results.push(subtractMoney(total, results.reduce((sum, value) => sum.plus(value), new Decimal(0)), input.paymentCurrency));
      break;
    }
    const obligationAmount = parseMoney(input.obligationAmounts[index], input.obligationCurrency);
    const paymentAmount = input.paymentCurrency === input.obligationCurrency
      ? obligationAmount
      : input.paymentCurrency === Currency.LBP
        ? fromBaseAmount(obligationAmount, Currency.LBP, rate, Decimal.ROUND_HALF_UP)
        : toBaseAmount(obligationAmount, Currency.LBP, rate, Decimal.ROUND_HALF_UP);
    results.push(paymentAmount);
  }

  return results;
}

/**
 * Converts a payment-side amount into the target obligation currency. The
 * returned `amount` is the only value balance calculations consume.
 */
export function convertPaymentAllocation(input: {
  paymentAmount: string | Decimal;
  paymentCurrency: Currency;
  obligationCurrency: Currency;
  exchangeRate: string | Decimal;
}): ConvertedPaymentAllocation {
  const paymentAmount = parseMoney(input.paymentAmount, input.paymentCurrency);
  if (input.paymentCurrency === input.obligationCurrency) {
    return { amount: paymentAmount, paymentAmount, exchangeRate: new Decimal(1) };
  }

  const exchangeRate = parseExchangeRate(input.exchangeRate);
  const amount = input.paymentCurrency === Currency.LBP
    ? toBaseAmount(paymentAmount, Currency.LBP, exchangeRate, Decimal.ROUND_HALF_UP)
    : fromBaseAmount(paymentAmount, Currency.LBP, exchangeRate, Decimal.ROUND_HALF_UP);

  return { amount, paymentAmount, exchangeRate };
}
