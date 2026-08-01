import { Decimal } from '@prisma/client/runtime/library';
import { PricingCalculationError } from './pricing-errors';

const PERCENT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;

export function parsePricingPercent(input: string | Decimal, maximum = new Decimal('999.999')): Decimal {
  const raw = input.toString().trim();
  if (!PERCENT_PATTERN.test(raw)) {
    throw new PricingCalculationError('Percentage must be a non-negative decimal with up to 3 decimal places');
  }
  const value = new Decimal(raw);
  if (value.greaterThan(maximum)) {
    throw new PricingCalculationError(`Percentage cannot exceed ${maximum.toFixed(3)}`);
  }
  return value;
}

export function percentFactor(percent: Decimal): Decimal {
  return new Decimal(1).plus(percent.div(100));
}

export function percentToApiString(percent: Decimal): string {
  return new Decimal(percent.toString()).toFixed(3);
}
