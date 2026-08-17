import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it } from 'vitest';
import { agingBucket, buildAgingRows, summariseAging, type AgingDebtRecord } from './receivables-aging';

const cutoff = '2026-08-31';
const nextDay = new Date(Date.UTC(2026, 8, 1));
const customer = { id: 'c1', name: 'Rami', phone: '70000000' };

function debt(overrides: Partial<AgingDebtRecord> = {}): AgingDebtRecord {
  return {
    id: 'd1', description: 'Fridge', originalAmount: new Decimal('100.00'),
    dueDate: new Date(Date.UTC(2026, 7, 20)), createdAt: new Date(Date.UTC(2026, 7, 1)),
    cancelledAt: null, customer, salesOrder: null, paymentAllocations: [],
    ...overrides,
  };
}

function allocation(amount: string, paymentDate: Date, voidedAt: Date | null = null) {
  return { amount: new Decimal(amount), payment: { paymentDate, voidedAt } };
}

describe('receivables aging buckets', () => {
  it('places each age in the bucket the plan defines, on the boundaries', () => {
    expect(agingBucket(0)).toBe('DAYS_0_7');
    expect(agingBucket(7)).toBe('DAYS_0_7');
    expect(agingBucket(8)).toBe('DAYS_8_14');
    expect(agingBucket(14)).toBe('DAYS_8_14');
    expect(agingBucket(15)).toBe('DAYS_15_30');
    expect(agingBucket(30)).toBe('DAYS_15_30');
    expect(agingBucket(31)).toBe('DAYS_31_60');
    expect(agingBucket(60)).toBe('DAYS_31_60');
    expect(agingBucket(61)).toBe('DAYS_61_90');
    expect(agingBucket(90)).toBe('DAYS_61_90');
    expect(agingBucket(91)).toBe('DAYS_90_PLUS');
    expect(agingBucket(4000)).toBe('DAYS_90_PLUS');
  });

  it('never reports a negative age', () => {
    expect(agingBucket(-5)).toBe('DAYS_0_7');
  });
});

describe('buildAgingRows', () => {
  let records: AgingDebtRecord[];
  beforeEach(() => { records = []; });

  it('ages a debt from its creation date, not its due date', () => {
    records.push(debt({ createdAt: new Date(Date.UTC(2026, 7, 1)) }));
    const [row] = buildAgingRows(records, cutoff, nextDay);

    expect(row.createdOn).toBe('2026-08-01');
    expect(row.daysUnpaid).toBe(30);
    expect(row.bucket).toBe('DAYS_15_30');
  });

  it('shows a partially paid debt with its remaining balance', () => {
    records.push(debt({ paymentAllocations: [allocation('40.00', new Date(Date.UTC(2026, 7, 10)))] }));
    const [row] = buildAgingRows(records, cutoff, nextDay);

    expect(row.originalAmount).toBe('100.00');
    expect(row.paidAmount).toBe('40.00');
    expect(row.remainingAmount).toBe('60.00');
    expect(row.lastPaymentDate).toBe('2026-08-10');
  });

  it('excludes a fully paid debt from the unpaid aging report', () => {
    records.push(debt({ paymentAllocations: [allocation('100.00', new Date(Date.UTC(2026, 7, 10)))] }));
    expect(buildAgingRows(records, cutoff, nextDay)).toEqual([]);
  });

  it('excludes an overpaid debt rather than reporting a negative balance', () => {
    records.push(debt({ paymentAllocations: [allocation('130.00', new Date(Date.UTC(2026, 7, 10)))] }));
    expect(buildAgingRows(records, cutoff, nextDay)).toEqual([]);
  });

  /**
   * Point-in-time rules must match the debt snapshot exactly: what mattered at
   * the cutoff is what was true then, not what is true now.
   */
  it('ignores a payment made after the cutoff', () => {
    records.push(debt({ paymentAllocations: [allocation('100.00', new Date(Date.UTC(2026, 8, 5)))] }));
    const [row] = buildAgingRows(records, cutoff, nextDay);

    expect(row.remainingAmount).toBe('100.00');
    expect(row.lastPaymentDate).toBeNull();
  });

  it('still counts a payment that was voided after the cutoff', () => {
    records.push(debt({ paymentAllocations: [allocation('40.00', new Date(Date.UTC(2026, 7, 10)), new Date(Date.UTC(2026, 8, 9)))] }));
    expect(buildAgingRows(records, cutoff, nextDay)[0].remainingAmount).toBe('60.00');
  });

  it('drops a payment voided on or before the cutoff', () => {
    records.push(debt({ paymentAllocations: [allocation('40.00', new Date(Date.UTC(2026, 7, 10)), new Date(Date.UTC(2026, 7, 15)))] }));
    expect(buildAgingRows(records, cutoff, nextDay)[0].remainingAmount).toBe('100.00');
  });

  it('excludes a debt cancelled on or before the cutoff and keeps one cancelled later', () => {
    records.push(debt({ id: 'cancelled-early', cancelledAt: new Date(Date.UTC(2026, 7, 20)) }));
    records.push(debt({ id: 'cancelled-later', cancelledAt: new Date(Date.UTC(2026, 8, 20)) }));
    const rows = buildAgingRows(records, cutoff, nextDay);

    expect(rows.map((row) => row.debtId)).toEqual(['cancelled-later']);
  });

  it('marks a debt past its due date as overdue and one still due as unpaid', () => {
    records.push(debt({ id: 'overdue', dueDate: new Date(Date.UTC(2026, 7, 20)) }));
    records.push(debt({ id: 'future', dueDate: new Date(Date.UTC(2026, 8, 20)) }));
    const rows = buildAgingRows(records, cutoff, nextDay);

    expect(rows.find((row) => row.debtId === 'overdue')?.status).toBe('OVERDUE');
    expect(rows.find((row) => row.debtId === 'future')?.status).toBe('UNPAID');
  });

  it('marks a part-paid debt not yet due as partially paid', () => {
    records.push(debt({ dueDate: new Date(Date.UTC(2026, 8, 20)), paymentAllocations: [allocation('10.00', new Date(Date.UTC(2026, 7, 5)))] }));
    expect(buildAgingRows(records, cutoff, nextDay)[0].status).toBe('PARTIALLY_PAID');
  });

  it('sorts oldest debt first', () => {
    records.push(debt({ id: 'newer', createdAt: new Date(Date.UTC(2026, 7, 25)) }));
    records.push(debt({ id: 'older', createdAt: new Date(Date.UTC(2026, 5, 1)) }));
    expect(buildAgingRows(records, cutoff, nextDay).map((row) => row.debtId)).toEqual(['older', 'newer']);
  });
});

describe('summariseAging', () => {
  it('totals receivables, overdue, and each ageing band', () => {
    const rows = buildAgingRows([
      debt({ id: 'a', createdAt: new Date(Date.UTC(2026, 7, 28)), dueDate: new Date(Date.UTC(2026, 8, 20)), originalAmount: new Decimal('50.00') }),
      debt({ id: 'b', createdAt: new Date(Date.UTC(2026, 4, 1)), originalAmount: new Decimal('200.00'), customer: { id: 'c2', name: 'Layla', phone: '71' } }),
    ], cutoff, nextDay);
    const summary = summariseAging(rows);

    expect(summary.count).toBe(2);
    expect(summary.totalReceivables).toBe('250.00');
    expect(summary.totalOverdue).toBe('200.00');
    expect(summary.customersOwing).toBe(2);
    expect(summary.over90).toBe('200.00');
    expect(summary.oldestDebt?.debtId).toBe('b');
    expect(summary.largestCustomer?.customerName).toBe('Layla');
    expect(summary.buckets.find((bucket) => bucket.key === 'DAYS_0_7')?.amount).toBe('50.00');
    expect(summary.buckets.find((bucket) => bucket.key === 'DAYS_90_PLUS')?.amount).toBe('200.00');
  });

  it('reports zeroes and no offenders for an empty period', () => {
    const summary = summariseAging([]);

    expect(summary.count).toBe(0);
    expect(summary.totalReceivables).toBe('0.00');
    expect(summary.oldestDebt).toBeNull();
    expect(summary.largestCustomer).toBeNull();
    expect(summary.buckets).toHaveLength(6);
  });
});
