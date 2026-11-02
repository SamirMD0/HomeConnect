import { Currency, SupplierTransactionDirection as Direction, SupplierTransactionStatus as Status, SupplierTransactionType as Type } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { buildSupplierStatement, SupplierStatementRecord } from './supplier-statement.service';

const supplier = { id: 's-1', name: 'Al Noor', phone: '01', companyName: null };

function record(id: string, date: string, direction: Direction, amount: string, overrides: Partial<SupplierStatementRecord> = {}): SupplierStatementRecord {
  return {
    id,
    type: direction === Direction.INCREASE_OWED ? Type.SUPPLIER_DEBT : Type.SUPPLIER_PAYMENT,
    direction,
    status: Status.ACTIVE,
    amount: new Decimal(amount),
    currency: Currency.USD,
    exchangeRate: new Decimal(1),
    baseAmount: new Decimal(amount),
    transactionDate: new Date(`${date}T00:00:00.000Z`),
    dueDate: null,
    description: id,
    reference: null,
    removedReason: null,
    createdAt: new Date(`${date}T08:00:00.000Z`),
    ...overrides,
  };
}

const range = { from: '2026-03-01', to: '2026-03-31' };

describe('buildSupplierStatement', () => {
  it('carries earlier transactions into the opening balance', () => {
    const statement = buildSupplierStatement(supplier, [
      record('old-debt', '2026-01-10', Direction.INCREASE_OWED, '500.00'),
      record('old-payment', '2026-02-10', Direction.DECREASE_OWED, '200.00'),
    ], range);
    expect(statement.openingBalance).toBe('300.00');
    expect(statement.entries).toEqual([]);
    expect(statement.closingBalance).toBe('300.00');
  });

  it('runs the balance through the period in date order, whatever order rows arrive in', () => {
    const statement = buildSupplierStatement(supplier, [
      record('payment', '2026-03-20', Direction.DECREASE_OWED, '150.00'),
      record('debt', '2026-03-05', Direction.INCREASE_OWED, '400.00'),
    ], range);
    expect(statement.entries.map((entry) => [entry.id, entry.balanceEffect, entry.runningBalance])).toEqual([
      ['debt', '400.00', '400.00'],
      ['payment', '-150.00', '250.00'],
    ]);
    expect(statement.closingBalance).toBe('250.00');
  });

  it('shows a removed transaction without letting it move the balance', () => {
    const statement = buildSupplierStatement(supplier, [
      record('debt', '2026-03-05', Direction.INCREASE_OWED, '400.00'),
      record('removed', '2026-03-06', Direction.INCREASE_OWED, '999.00', { status: Status.REMOVED, removedReason: 'Entered twice' }),
    ], range);
    expect(statement.entries[1]).toMatchObject({ status: 'REMOVED', balanceEffect: '0.00', runningBalance: '400.00', reason: 'Entered twice' });
    expect(statement.closingBalance).toBe('400.00');
  });

  it('leaves out transactions after the period', () => {
    const statement = buildSupplierStatement(supplier, [
      record('later', '2026-04-01', Direction.INCREASE_OWED, '700.00'),
    ], range);
    expect(statement.entries).toEqual([]);
    expect(statement.closingBalance).toBe('0.00');
  });

  it('uses the USD base amount for the balance and keeps the original currency for display', () => {
    const statement = buildSupplierStatement(supplier, [
      record('lbp', '2026-03-05', Direction.INCREASE_OWED, '8950000', { currency: Currency.LBP, exchangeRate: new Decimal(89500), baseAmount: new Decimal('100.00') }),
    ], range);
    expect(statement.entries[0]).toMatchObject({ currency: 'LBP', balanceEffect: '100.00', runningBalance: '100.00' });
  });
});
