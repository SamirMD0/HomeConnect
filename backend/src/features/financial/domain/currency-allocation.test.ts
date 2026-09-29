import { Currency } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { calculateDebtBalance } from './balances';
import { convertPaymentAllocation, splitPaymentAmounts } from './currency-allocation';
import { moneyToApiString } from './money';

describe('currency payment allocations', () => {
  it('INV-18 keeps debt arithmetic in the obligation currency', () => {
    const allocation = convertPaymentAllocation({
      paymentAmount: '4500000',
      paymentCurrency: Currency.LBP,
      obligationCurrency: Currency.USD,
      exchangeRate: '90000',
    });
    const balance = calculateDebtBalance({
      originalAmount: new Decimal('1000.00'),
      allocations: [{ amount: allocation.amount, isVoided: false }],
    });

    expect(moneyToApiString(allocation.amount)).toBe('50.00');
    expect(moneyToApiString(allocation.paymentAmount, Currency.LBP)).toBe('4500000');
    expect(moneyToApiString(balance.remainingBalance)).toBe('950.00');
  });

  it('converts USD payments to whole-LBP obligations HALF_UP', () => {
    const allocation = convertPaymentAllocation({
      paymentAmount: '10.01',
      paymentCurrency: Currency.USD,
      obligationCurrency: Currency.LBP,
      exchangeRate: '90000',
    });
    expect(moneyToApiString(allocation.amount, Currency.LBP)).toBe('900900');
  });

  it('INV-19 assigns the conversion residual so payment-side allocations sum exactly', () => {
    const amounts = splitPaymentAmounts({
      obligationAmounts: [new Decimal('16.67'), new Decimal('16.67'), new Decimal('16.66')],
      totalPaymentAmount: '4500000',
      paymentCurrency: Currency.LBP,
      obligationCurrency: Currency.USD,
      exchangeRate: '90000',
    });
    expect(amounts.map((amount) => amount.toFixed(0))).toEqual(['1500300', '1500300', '1499400']);
    expect(amounts.reduce((sum, amount) => sum.plus(amount), new Decimal(0)).toFixed(0)).toBe('4500000');
  });
});
