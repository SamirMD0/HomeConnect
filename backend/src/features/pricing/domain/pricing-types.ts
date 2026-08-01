import { Decimal } from '@prisma/client/runtime/library';

export type PricingCalculationModeValue = 'COMPOUND' | 'SIMPLE';
export type PricingRoundingModeValue = 'NONE' | 'NEAREST_0_50' | 'NEAREST_1' | 'CEIL_1';

export interface PricingConfig {
  expensePercent: Decimal;
  profitPercent: Decimal;
  discountBufferPercent: Decimal;
  installmentMarkupPercent: Decimal;
  downPaymentPercent: Decimal;
  installmentMonths: number;
  calculationMode: PricingCalculationModeValue;
  roundingMode: PricingRoundingModeValue;
}

export interface PricingResult {
  cashPrice: string;
  installmentPrice: string;
  downPayment: string;
  remaining: string;
  monthlyPayment: string;
  lastInstallmentPayment: string;
  installmentMonths: number;
  expensesAmount: string;
  profitAmount: string;
  discountBufferAmount: string;
  priceWithoutDiscountBuffer: string;
  internalPriceCode: string | null;
}
