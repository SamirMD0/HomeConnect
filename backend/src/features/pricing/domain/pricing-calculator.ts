import { Decimal } from '@prisma/client/runtime/library';
import { Currency } from '@prisma/client';
import { divideMoney, moneyToApiString, multiplyMoney, parseMoney, roundMoney, subtractMoney } from '../../financial/domain/money';
import { PricingCalculationError } from './pricing-errors';
import { percentFactor } from './pricing-percent';
import { PricingConfig, PricingResult, PricingRoundingModeValue } from './pricing-types';
import { formatInternalPriceCode } from './internal-price-code';

export function calculatePricing(costPrice: Decimal, config: PricingConfig, currency: Currency = Currency.USD): PricingResult {
  if (!Number.isInteger(config.installmentMonths) || config.installmentMonths < 1) {
    throw new PricingCalculationError('Installment months must be a positive integer');
  }

  const cost = parseMoney(costPrice, currency);
  const stages = rawCashStages(cost, config);
  const cashPrice = applyPriceRounding(stages.cashRaw, config.roundingMode, currency);
  const installmentPrice = applyPriceRounding(
    cashPrice.mul(percentFactor(config.installmentMarkupPercent)),
    config.roundingMode,
    currency
  );
  const downPayment = multiplyMoney(
    installmentPrice,
    config.downPaymentPercent.div(100),
    currency,
    Decimal.ROUND_HALF_UP
  );
  const remaining = subtractMoney(installmentPrice, downPayment, currency);
  const monthlyPayment = divideMoney(
    remaining,
    new Decimal(config.installmentMonths),
    currency,
    Decimal.ROUND_FLOOR
  );
  const lastInstallmentPayment = subtractMoney(
    remaining,
    monthlyPayment.mul(config.installmentMonths - 1),
    currency
  );

  return {
    cashPrice: moneyToApiString(cashPrice, currency),
    installmentPrice: moneyToApiString(installmentPrice, currency),
    downPayment: moneyToApiString(downPayment, currency),
    remaining: moneyToApiString(remaining, currency),
    monthlyPayment: moneyToApiString(monthlyPayment, currency),
    lastInstallmentPayment: moneyToApiString(lastInstallmentPayment, currency),
    installmentMonths: config.installmentMonths,
    expensesAmount: displayMoney(stages.expensesRaw, currency),
    profitAmount: displayMoney(stages.profitRaw, currency),
    discountBufferAmount: displayMoney(stages.bufferRaw, currency),
    priceWithoutDiscountBuffer: displayMoney(stages.beforeBufferRaw, currency),
    internalPriceCode: formatInternalPriceCode(stages.beforeBufferRaw),
  };
}

function rawCashStages(cost: Decimal, config: PricingConfig) {
  if (config.calculationMode === 'SIMPLE') {
    const expensesRaw = cost.mul(config.expensePercent.div(100));
    const profitRaw = cost.mul(config.profitPercent.div(100));
    const bufferRaw = cost.mul(config.discountBufferPercent.div(100));
    const beforeBufferRaw = cost.plus(expensesRaw).plus(profitRaw);
    return { expensesRaw, profitRaw, bufferRaw, beforeBufferRaw, cashRaw: beforeBufferRaw.plus(bufferRaw) };
  }

  const afterExpenses = cost.mul(percentFactor(config.expensePercent));
  const afterProfit = afterExpenses.mul(percentFactor(config.profitPercent));
  const cashRaw = afterProfit.mul(percentFactor(config.discountBufferPercent));
  return {
    expensesRaw: afterExpenses.minus(cost),
    profitRaw: afterProfit.minus(afterExpenses),
    bufferRaw: cashRaw.minus(afterProfit),
    beforeBufferRaw: afterProfit,
    cashRaw,
  };
}

function applyPriceRounding(value: Decimal, mode: PricingRoundingModeValue, currency: Currency): Decimal {
  let rounded: Decimal;
  if (mode === 'NEAREST_0_50') {
    rounded = value.div('0.50').toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul('0.50');
  } else if (mode === 'NEAREST_1') {
    rounded = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  } else if (mode === 'CEIL_1') {
    rounded = value.toDecimalPlaces(0, Decimal.ROUND_CEIL);
  } else {
    rounded = value;
  }
  return roundMoney(rounded, currency, Decimal.ROUND_HALF_UP);
}

function displayMoney(value: Decimal, currency: Currency): string {
  return moneyToApiString(roundMoney(value, currency, Decimal.ROUND_HALF_UP), currency);
}
