import { SalesOrderPaymentStatus } from '@prisma/client';
import {
  compareMoney,
  moneyToApiString,
  multiplyMoney,
  parseMoney,
  subtractMoney,
  sumMoney,
  ZERO_MONEY,
} from '../../financial/domain/money';
import { ValidationError } from '../../../lib/errors';
import type {
  SalesOrderLineMoneyInput,
  SalesOrderMoneyInput,
  SalesOrderMoneyTotals,
} from './sales-types';

export function calculateSalesOrderLineTotal(input: SalesOrderLineMoneyInput): string {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 999) {
    throw new ValidationError('Quantity must be an integer between 1 and 999');
  }

  const unitPrice = parseMoney(input.unitPrice);
  if (compareMoney(unitPrice, ZERO_MONEY) <= 0) {
    throw new ValidationError('Unit price must be greater than zero');
  }

  const gross = multiplyMoney(unitPrice, String(input.quantity));
  const discount = parseMoney(input.discountAmount ?? '0.00');
  if (compareMoney(discount, ZERO_MONEY) < 0) {
    throw new ValidationError('Discount amount cannot be negative');
  }
  if (compareMoney(discount, gross) > 0) {
    throw new ValidationError('Discount amount cannot exceed the line amount');
  }

  return moneyToApiString(subtractMoney(gross, discount));
}

export function calculateSalesOrderTotals(input: SalesOrderMoneyInput): SalesOrderMoneyTotals {
  if (input.items.length === 0) throw new ValidationError('At least one item is required');

  const lineTotals = input.items.map(calculateSalesOrderLineTotal);
  const itemsSubtotal = sumMoney(lineTotals);
  const deliveryFee = parseMoney(input.deliveryFee ?? '0.00');
  if (compareMoney(deliveryFee, ZERO_MONEY) < 0) {
    throw new ValidationError('Delivery fee cannot be negative');
  }

  const totalAmount = sumMoney([itemsSubtotal, deliveryFee]);
  const paidAmount = parseMoney(input.paidAmount ?? '0.00');
  if (compareMoney(paidAmount, ZERO_MONEY) < 0) {
    throw new ValidationError('Paid amount cannot be negative');
  }
  if (compareMoney(paidAmount, totalAmount) > 0) {
    throw new ValidationError('Paid amount cannot exceed the order total');
  }

  return {
    lineTotals,
    itemsSubtotal: moneyToApiString(itemsSubtotal),
    deliveryFee: moneyToApiString(deliveryFee),
    totalAmount: moneyToApiString(totalAmount),
    paidAmount: moneyToApiString(paidAmount),
    remainingAmount: moneyToApiString(subtractMoney(totalAmount, paidAmount)),
  };
}

export function deriveSalesOrderPaymentStatus(
  paidAmount: string,
  totalAmount: string
): SalesOrderPaymentStatus {
  const comparisonWithZero = compareMoney(paidAmount, ZERO_MONEY);
  const comparisonWithTotal = compareMoney(paidAmount, totalAmount);
  if (comparisonWithZero < 0 || comparisonWithTotal > 0) {
    throw new ValidationError('Paid amount must be between zero and the order total');
  }
  if (comparisonWithZero === 0) return SalesOrderPaymentStatus.UNPAID;
  if (comparisonWithTotal === 0) return SalesOrderPaymentStatus.PAID;
  return SalesOrderPaymentStatus.PARTIALLY_PAID;
}
