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

/**
 * Presents a configured selling price without changing what the price means.
 * Inclusive retail prices remain the final payable amount; explicitly
 * exclusive prices have VAT added for the customer-payable presentation.
 */
export function presentVatPrice(
  quotedPrice: MoneyInput,
  taxRatePercent: MoneyInput,
  currency: MoneyCurrency,
  priceIncludesVat: boolean
) {
  const line = calculateVatLine({
    currency,
    quotedUnitPrice: quotedPrice,
    quantity: 1,
    priceIncludesVat,
    taxRatePercent,
    taxCode: 'PRESENTATION',
  });
  return {
    priceExVat: line.lineTotalExVat,
    vatAmount: line.vatAmount,
    priceIncVat: line.lineTotalIncVat,
  };
}

export interface VatSnapshotInput {
  taxRateSnapshot: MoneyInput;
  taxCodeSnapshot: string | null;
  unitPriceExVat: MoneyInput;
  vatAmount: MoneyInput;
  lineTotalExVat: MoneyInput;
  lineTotalIncVat: MoneyInput;
}

/**
 * Builds a refund/reversal from the original stored VAT snapshot. It never
 * accepts or reads a current tax rate, so a later configuration change cannot
 * rewrite history.
 */
export function reverseVatSnapshot(snapshot: VatSnapshotInput, currency: MoneyCurrency) {
  return {
    taxRateSnapshot: new Decimal(snapshot.taxRateSnapshot.toString()),
    taxCodeSnapshot: snapshot.taxCodeSnapshot,
    unitPriceExVat: roundMoney(new Decimal(snapshot.unitPriceExVat.toString()).negated(), currency, Decimal.ROUND_HALF_UP),
    vatAmount: roundMoney(new Decimal(snapshot.vatAmount.toString()).negated(), currency, Decimal.ROUND_HALF_UP),
    lineTotalExVat: roundMoney(new Decimal(snapshot.lineTotalExVat.toString()).negated(), currency, Decimal.ROUND_HALF_UP),
    lineTotalIncVat: roundMoney(new Decimal(snapshot.lineTotalIncVat.toString()).negated(), currency, Decimal.ROUND_HALF_UP),
  };
}
