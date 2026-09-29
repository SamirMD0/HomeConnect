import { Currency, DebtStatus, InstallmentPlanStatus, InstallmentStatus, PaymentMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerStatementRecordSet } from './customer-statement.repository';
import { CustomerStatementRepository } from './customer-statement.repository';
import { CustomerStatementService } from './customer-statement.service';

vi.mock('./customer-statement.repository', async () => {
  const actual = await vi.importActual<typeof import('./customer-statement.repository')>('./customer-statement.repository');
  return { ...actual, CustomerStatementRepository: { load: vi.fn() } };
});

const money = (value: string) => new Decimal(value);
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

function records(): CustomerStatementRecordSet {
  return {
    customer: { id: 'customer-1', name: 'Complex Customer', phone: '70123456', address: 'Beirut' },
    debts: [
      { id: 'debt-open', description: 'Open debt', originalAmount: money('100.00'), baseOriginalAmount: money('100.00'), currency: Currency.USD, exchangeRate: money('1'), dueDate: date('2026-01-20'), status: DebtStatus.PARTIALLY_PAID, createdAt: date('2026-01-02'), cancelledAt: null, cancelReason: null, salesOrder: { orderNumber: 'SO-1' } },
      { id: 'debt-second', description: 'Second open debt', originalAmount: money('80.00'), baseOriginalAmount: money('80.00'), currency: Currency.USD, exchangeRate: money('1'), dueDate: date('2026-02-20'), status: DebtStatus.PARTIALLY_PAID, createdAt: new Date('2026-01-02T01:00:00.000Z'), cancelledAt: null, cancelReason: null, salesOrder: { orderNumber: 'SO-2' } },
      { id: 'debt-cancelled', description: 'Cancelled debt', originalAmount: money('60.00'), baseOriginalAmount: money('60.00'), currency: Currency.USD, exchangeRate: money('1'), dueDate: date('2026-01-20'), status: DebtStatus.CANCELLED, createdAt: date('2026-01-03'), cancelledAt: date('2026-01-10'), cancelReason: 'Duplicate', salesOrder: null },
    ],
    plans: [{
      id: 'plan-1', description: 'Laptop plan', currency: Currency.USD, exchangeRate: money('1'), status: InstallmentPlanStatus.ACTIVE, createdAt: date('2026-01-02'), cancelledAt: null, cancelReason: null, salesOrder: null,
      installments: [
        { id: 'installment-1', installmentNumber: 1, amountDue: money('50.00'), baseAmountDue: money('50.00'), dueDate: date('2026-01-15'), status: InstallmentStatus.PARTIALLY_PAID, createdAt: date('2026-01-02') },
        { id: 'installment-2', installmentNumber: 2, amountDue: money('50.00'), baseAmountDue: money('50.00'), dueDate: date('2026-02-15'), status: InstallmentStatus.PENDING, createdAt: date('2026-01-02') },
      ],
    }],
    payments: [
      { id: 'payment-valid', totalAmount: money('90.00'), baseAmount: money('90.00'), currency: Currency.USD, exchangeRate: money('1'), paymentDate: date('2026-01-04'), paymentMethod: PaymentMethod.CASH, reference: 'R-1', notes: null, createdAt: date('2026-01-04'), voidedAt: null, voidReason: null, allocations: [
        { id: 'a-1', debtId: 'debt-open', installmentId: null, paymentAmount: money('40.00'), voidedAt: null },
        { id: 'a-1b', debtId: 'debt-second', installmentId: null, paymentAmount: money('20.00'), voidedAt: null },
        { id: 'a-2', debtId: null, installmentId: 'installment-1', paymentAmount: money('30.00'), voidedAt: null },
      ] },
      { id: 'payment-void', totalAmount: money('10.00'), baseAmount: money('10.00'), currency: Currency.USD, exchangeRate: money('1'), paymentDate: date('2026-01-05'), paymentMethod: PaymentMethod.CASH, reference: null, notes: null, createdAt: date('2026-01-05'), voidedAt: date('2026-01-06'), voidReason: 'Wrong customer', allocations: [
        { id: 'a-3', debtId: 'debt-open', installmentId: null, paymentAmount: money('10.00'), voidedAt: date('2026-01-06') },
      ] },
    ],
  } as CustomerStatementRecordSet;
}

describe('CustomerStatementService', () => {
  beforeEach(() => vi.mocked(CustomerStatementRepository.load).mockResolvedValue(records()));

  it('derives a continuous server-side balance that equals independently calculated outstanding (INV-01)', async () => {
    const statement = await CustomerStatementService.get('customer-1', { from: '2026-01-01', to: '2026-12-31' });
    const independentOutstanding = money('100').plus('80').plus('50').plus('50').minus('40').minus('20').minus('30').toFixed(2);
    expect(statement.closingBalance).toBe(independentOutstanding);
    let expected = new Decimal(statement.openingBalance);
    for (const entry of statement.entries) {
      expected = expected.plus(entry.balanceEffect);
      expect(entry.runningBalance).toBe(expected.toFixed(2));
    }
    expect(statement.aging.total).toBe(statement.closingBalance);
  });

  it('uses deterministic same-day ordering: debts, installments by number, then payments', async () => {
    const statement = await CustomerStatementService.get('customer-1', { from: '2026-01-02', to: '2026-01-04' });
    expect(statement.entries.map((entry) => entry.id)).toEqual([
      'debt-open', 'debt-second', 'installment-1', 'installment-2', 'debt-cancelled', 'payment-valid',
    ]);
  });

  it('derives opening balance from valid transactions before the inclusive range', async () => {
    const statement = await CustomerStatementService.get('customer-1', { from: '2026-01-04', to: '2026-01-05' });
    expect(statement.openingBalance).toBe('280.00');
    expect(statement.closingBalance).toBe('190.00');
  });

  it('keeps voided payments and cancelled debts visible with zero effect', async () => {
    const statement = await CustomerStatementService.get('customer-1', { from: '2026-01-01', to: '2026-01-31' });
    expect(statement.entries.find((entry) => entry.id === 'payment-void')).toMatchObject({ status: 'VOIDED', balanceEffect: '0.00' });
    expect(statement.entries.find((entry) => entry.id === 'debt-cancelled')).toMatchObject({ status: 'CANCELLED', balanceEffect: '0.00' });
  });
});
