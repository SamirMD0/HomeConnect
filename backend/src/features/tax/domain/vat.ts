import { ValidationError } from '../../../lib/errors';
import {
  Decimal,
  MoneyCurrency,
  MoneyInput,
  addMoney,
  compareMoney,
  divideMoney,
  multiplyMoney,
  parseMoney,
  roundMoney,
  subtractMoney,
  ZERO_MONEY,
} from '../../financial/domain/money';

export interface VatLineInput {
  currency: MoneyCurrency;
  quotedUnitPrice: MoneyInput;
  quantity: number;
  discountAmount?: MoneyInput | null;
  priceIncludesVat: boolean;
  taxRatePercent: MoneyInput;
  taxCode: string;
}

export interface VatLineResult {
  taxRateSnapshot: Decimal;
  taxCodeSnapshot: string;
  unitPriceExVat: Decimal;
  lineTotalExVat: Decimal;
  vatAmount: Decimal;
  lineTotalIncVat: Decimal;
}

/** Pure VAT arithmetic. Configuration lookup and clocks belong to the caller. */
export function calculateVatLine(input: VatLineInput): VatLineResult {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new ValidationError('VAT line quantity must be a positive integer');
  }
  const taxCode = input.taxCode.trim();
  if (!taxCode) throw new ValidationError('Tax code is required');

  const rate = new Decimal(input.taxRatePercent.toString());
  if (!rate.isFinite() || rate.decimalPlaces() > 3 || rate.lessThan(0) || rate.greaterThan(100)) {
    throw new ValidationError('Tax rate must be between 0.000 and 100.000 with at most 3 decimal places');
  }
  const normalizedRate = rate.toDecimalPlaces(3);
  const quotedUnitPrice = parseMoney(input.quotedUnitPrice, input.currency);
  if (compareMoney(quotedUnitPrice, ZERO_MONEY, input.currency) < 0) {
    throw new ValidationError('Quoted unit price cannot be negative');
  }
  const gross = multiplyMoney(quotedUnitPrice, String(input.quantity), input.currency, Decimal.ROUND_HALF_UP);
  const discount = parseMoney(input.discountAmount ?? ZERO_MONEY, input.currency);
  if (compareMoney(discount, ZERO_MONEY, input.currency) < 0 || compareMoney(discount, gross, input.currency) > 0) {
    throw new ValidationError('Discount amount must be between zero and the extended quoted amount');
  }
  const quotedLineTotal = subtractMoney(gross, discount, input.currency);
  const multiplier = normalizedRate.div(100).plus(1);

  if (input.priceIncludesVat) {
    const lineTotalExVat = divideMoney(quotedLineTotal, multiplier, input.currency, Decimal.ROUND_HALF_UP);
    const vatAmount = subtractMoney(quotedLineTotal, lineTotalExVat, input.currency);
    return {
      taxRateSnapshot: normalizedRate,
      taxCodeSnapshot: taxCode,
      unitPriceExVat: divideMoney(quotedUnitPrice, multiplier, input.currency, Decimal.ROUND_HALF_UP),
      lineTotalExVat,
      vatAmount,
      lineTotalIncVat: quotedLineTotal,
    };
  }

  const vatAmount = multiplyMoney(quotedLineTotal, normalizedRate.div(100), input.currency, Decimal.ROUND_HALF_UP);
  return {
    taxRateSnapshot: normalizedRate,
    taxCodeSnapshot: taxCode,
    unitPriceExVat: roundMoney(quotedUnitPrice, input.currency, Decimal.ROUND_HALF_UP),
    lineTotalExVat: quotedLineTotal,
    vatAmount,
    lineTotalIncVat: addMoney(quotedLineTotal, vatAmount, input.currency),
  };
}

export function presentExVatPrice(
  priceExVat: MoneyInput,
  taxRatePercent: MoneyInput,
  currency: MoneyCurrency
) {
  const result = calculateVatLine({
    currency,
    quotedUnitPrice: priceExVat,
    quantity: 1,
    priceIncludesVat: false,
    taxRatePercent,
    taxCode: 'PRESENTATION',
  });
  return {
    priceExVat: result.lineTotalExVat,
    vatAmount: result.vatAmount,
    priceIncVat: result.lineTotalIncVat,
  };
}
