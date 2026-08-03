import { describe, expect, it } from 'vitest';
import { SalesOrderPaymentStatus } from '@prisma/client';
import { moneyToApiString, multiplyMoney } from '../../financial/domain/money';
import {
  calculateSalesOrderLineTotal,
  calculateSalesOrderTotals,
  deriveSalesOrderPaymentStatus,
} from './sales-order-totals';

describe('sales order totals', () => {
  it('calculates line totals with absolute discounts', () => {
    expect(calculateSalesOrderLineTotal({ quantity: 2, unitPrice: '12.50' })).toBe('25.00');
    expect(calculateSalesOrderLineTotal({ quantity: 2, unitPrice: '12.50', discountAmount: '1.25' })).toBe('23.75');
  });

  it('keeps integer-quantity sales lines exact without requiring fractional-cent rounding', () => {
    const result = calculateSalesOrderTotals({
      items: [{ quantity: 3, unitPrice: '33.33' }],
      deliveryFee: '0.01',
      paidAmount: '20.00',
    });
    expect(result).toMatchObject({
      lineTotals: ['99.99'],
      itemsSubtotal: '99.99',
      deliveryFee: '0.01',
      totalAmount: '100.00',
      paidAmount: '20.00',
      remainingAmount: '80.00',
    });
  });

  it('guards the .005 boundary through the shared money rounding contract', () => {
    expect(moneyToApiString(multiplyMoney('0.01', '0.5'))).toBe('0.01');
  });

  it('derives all payment status bands', () => {
    expect(deriveSalesOrderPaymentStatus('0.00', '10.00')).toBe(SalesOrderPaymentStatus.UNPAID);
    expect(deriveSalesOrderPaymentStatus('5.00', '10.00')).toBe(SalesOrderPaymentStatus.PARTIALLY_PAID);
    expect(deriveSalesOrderPaymentStatus('10.00', '10.00')).toBe(SalesOrderPaymentStatus.PAID);
  });

  it('rejects invalid quantities, money, discounts, and overpayment', () => {
    expect(() => calculateSalesOrderLineTotal({ quantity: 1.5, unitPrice: '1.00' })).toThrow();
    expect(() => calculateSalesOrderLineTotal({ quantity: 1, unitPrice: '1.001' })).toThrow();
    expect(() => calculateSalesOrderLineTotal({ quantity: 1, unitPrice: '1.00', discountAmount: '1.01' })).toThrow();
    expect(() => calculateSalesOrderTotals({ items: [] })).toThrow();
    expect(() => calculateSalesOrderTotals({ items: [{ quantity: 1, unitPrice: '1.00' }], paidAmount: '1.01' })).toThrow();
  });
});
