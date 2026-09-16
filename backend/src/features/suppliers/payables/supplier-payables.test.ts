import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { buildSupplierPayables, payableBucket } from './supplier-payables';

const supplier = { id: 'supplier-a', name: 'Supplier A', phone: '123' };
const row = (id: string, baseAmount: string, dueDate: string | null, direction: 'INCREASE_OWED' | 'DECREASE_OWED' = 'INCREASE_OWED') => ({
  id, supplier, baseAmount: new Decimal(baseAmount), amount: new Decimal(baseAmount), currency: 'USD',
  direction, type: direction === 'INCREASE_OWED' ? 'SUPPLIER_DEBT' : 'SUPPLIER_PAYMENT',
  transactionDate: '2026-01-01', createdAt: '2026-01-01T12:00:00.000Z', dueDate, description: id, receiptNumber: null,
});

describe('derived supplier payable FIFO', () => {
  it('settles oldest due first with partial payment and credit, preserves source rows, and reconciles', () => {
    const records = [row('later', '100', '2026-09-20'), row('oldest', '100', '2026-08-01'), row('unscheduled', '40', null),
      row('payment', '60', null, 'DECREASE_OWED'), { ...row('credit', '70', null, 'DECREASE_OWED'), type: 'SUPPLIER_CREDIT' }];
    const before = JSON.stringify(records);
    const result = buildSupplierPayables(records, '2026-09-14');
    expect(result.rows.map((r) => [r.id, r.remainingAmount])).toEqual([['later', '70.00'], ['unscheduled', '40.00']]);
    expect(result.summary.totalPayables).toBe('110.00');
    expect(result.summary.ledgerBalance).toBe('110.00');
    expect(result.summary.noDueDate).toBe('40.00');
    expect(result.summary.dueSoonAmount).toBe('70.00');
    expect(JSON.stringify(records)).toBe(before);
  });

  it.each([[0, 'CURRENT'], [1, 'DAYS_1_30'], [30, 'DAYS_1_30'], [31, 'DAYS_31_60'],
    [60, 'DAYS_31_60'], [61, 'DAYS_61_90'], [90, 'DAYS_61_90'], [91, 'DAYS_90_PLUS']])(
    'classifies overdue day %i in %s', (days, bucket) => expect(payableBucket(days as number)).toBe(bucket)
  );

  it('distinguishes overdue, today, day seven, day eight, and unscheduled', () => {
    const result = buildSupplierPayables([
      row('overdue', '10', '2026-09-13'), row('today', '20', '2026-09-14'), row('seven', '30', '2026-09-21'),
      row('eight', '40', '2026-09-22'), row('unknown', '50', null),
    ], '2026-09-14');
    expect(result.rows.map((r) => [r.id, r.status])).toEqual([
      ['overdue', 'OVERDUE'], ['today', 'DUE_SOON'], ['seven', 'DUE_SOON'], ['eight', 'FUTURE'], ['unknown', 'UNSCHEDULED'],
    ]);
    expect(result.summary.totalOverdue).toBe('10.00');
    expect(result.summary.dueSoonCount).toBe(2);
    expect(result.summary.dueSoonAmount).toBe('50.00');
    expect(result.summary.oldestOverdue?.id).toBe('overdue');
    expect(result.summary.buckets.find((b) => b.key === 'NO_DUE_DATE')?.amount).toBe('50.00');
  });

  it('deterministically breaks date ties by transaction date, creation time, then ID', () => {
    const records = [row('b', '10', '2026-09-01'), row('a', '10', '2026-09-01'), row('p', '15', null, 'DECREASE_OWED')];
    const first = buildSupplierPayables(records, '2026-09-14');
    expect(first.rows.map((r) => [r.id, r.remainingAmount])).toEqual([['b', '5.00']]);
    expect(buildSupplierPayables([...records].reverse(), '2026-09-14')).toEqual(first);
  });

  it('never crosses supplier boundaries and exposes excess settlement separately to reconcile negative balances', () => {
    const result = buildSupplierPayables([row('a', '10', null), row('p', '20', null, 'DECREASE_OWED'),
      { ...row('b', '30', '2026-09-01'), supplier: { ...supplier, id: 'supplier-b' } },
    ], '2026-09-14');
    expect(result.summary.totalPayables).toBe('30.00');
    expect(result.summary.unappliedCredit).toBe('10.00');
    expect(result.summary.ledgerBalance).toBe('20.00');
    expect(result.suppliers.map((s) => s.difference)).toEqual(['0.00', '0.00']);
  });

  it('settles multiple unscheduled balances in stable transaction/creation/ID order', () => {
    const records = [row('b', '10', null), row('a', '10', null), row('p', '15', null, 'DECREASE_OWED')];
    const first = buildSupplierPayables(records, '2026-09-14');
    expect(first.rows.map((r) => [r.id, r.remainingAmount])).toEqual([['b', '5.00']]);
    expect(buildSupplierPayables([...records].reverse(), '2026-09-14')).toEqual(first);
  });

  it('uses original stored base amounts for mixed currencies, not current exchange rates', () => {
    const lbp = { ...row('lbp', '1.11', '2026-09-01'), currency: 'LBP', amount: new Decimal('99345') };
    const result = buildSupplierPayables([lbp, row('p', '0.50', null, 'DECREASE_OWED')], '2026-09-14');
    expect(result.rows[0].remainingAmount).toBe('0.61');
    expect(result.rows[0].transactionAmount).toBe('99345');
    expect(result.summary.ledgerBalance).toBe('0.61');
  });
});
