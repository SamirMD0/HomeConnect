import { Decimal } from '@prisma/client/runtime/library';
import { divideMoney, moneyToApiString, multiplyMoney, parseMoney, subtractMoney } from '../../financial/domain/money';
import { PricingCalculationError } from './pricing-errors';
import { percentFactor } from './pricing-percent';
import { PricingConfig, PricingResult, PricingRoundingModeValue } from './pricing-types';

export function calculatePricing(costPrice: Decimal, config: PricingConfig): PricingResult {
  if (!Number.isInteger(config.installmentMonths) || config.installmentMonths < 1) {
    throw new PricingCalculationError('Installment months must be a positive integer');
  }

  const cost = parseMoney(costPrice);
  const stages = rawCashStages(cost, config);
  const cashPrice = applyPriceRounding(stages.cashRaw, config.roundingMode);
  const installmentPrice = applyPriceRounding(
    cashPrice.mul(percentFactor(config.installmentMarkupPercent)),
    config.roundingMode
  );
  const downPayment = multiplyMoney(
    installmentPrice,
    config.downPaymentPercent.div(100),
    Decimal.ROUND_HALF_UP
  );
  const remaining = subtractMoney(installmentPrice, downPayment);
  const monthlyPayment = divideMoney(
    remaining,
    new Decimal(config.installmentMonths),
    Decimal.ROUND_FLOOR
  );
  const lastInstallmentPayment = subtractMoney(
    remaining,
    monthlyPayment.mul(config.installmentMonths - 1)
  );

  return {
    cashPrice: moneyToApiString(cashPrice),
    installmentPrice: moneyToApiString(installmentPrice),
    downPayment: moneyToApiString(downPayment),
    remaining: moneyToApiString(remaining),
    monthlyPayment: moneyToApiString(monthlyPayment),
    lastInstallmentPayment: moneyToApiString(lastInstallmentPayment),
    installmentMonths: config.installmentMonths,
    expensesAmount: displayMoney(stages.expensesRaw),
    profitAmount: displayMoney(stages.profitRaw),
    discountBufferAmount: displayMoney(stages.bufferRaw),
  };
}

function rawCashStages(cost: Decimal, config: PricingConfig) {
  if (config.calculationMode === 'SIMPLE') {
    const expensesRaw = cost.mul(config.expensePercent.div(100));
    const profitRaw = cost.mul(config.profitPercent.div(100));
    const bufferRaw = cost.mul(config.discountBufferPercent.div(100));
    return { expensesRaw, profitRaw, bufferRaw, cashRaw: cost.plus(expensesRaw).plus(profitRaw).plus(bufferRaw) };
  }

  const afterExpenses = cost.mul(percentFactor(config.expensePercent));
  const afterProfit = afterExpenses.mul(percentFactor(config.profitPercent));
  const cashRaw = afterProfit.mul(percentFactor(config.discountBufferPercent));
  return {
    expensesRaw: afterExpenses.minus(cost),
    profitRaw: afterProfit.minus(afterExpenses),
    bufferRaw: cashRaw.minus(afterProfit),
    cashRaw,
  };
}

function applyPriceRounding(value: Decimal, mode: PricingRoundingModeValue): Decimal {
  if (mode === 'NEAREST_0_50') {
    return value.div('0.50').toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul('0.50').toDecimalPlaces(2);
  }
  if (mode === 'NEAREST_1') return value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toDecimalPlaces(2);
  if (mode === 'CEIL_1') return value.toDecimalPlaces(0, Decimal.ROUND_CEIL).toDecimalPlaces(2);
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function displayMoney(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
