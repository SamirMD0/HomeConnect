import { describe, expect, it } from 'vitest';
import {
  determineReceivableTier,
  receivableTierRank,
  ReceivableTierInput,
} from './receivables.tier';

function tierInput(overrides: Partial<ReceivableTierInput> = {}): ReceivableTierInput {
  return {
    billsTotal: 4,
    overdueItemCount: 1,
    maxOverdueDays: 10,
    paidRatioPercent: 50,
    paymentCount: 2,
    ...overrides,
  };
}

describe('determineReceivableTier', () => {
  it('returns NO_ACTIVITY when the customer has no obligations at all', () => {
    const result = determineReceivableTier(tierInput({ billsTotal: 0, overdueItemCount: 0 }));

    expect(result.tier).toBe('NO_ACTIVITY');
    expect(result.tierReason).toBe('No debts or installment plans recorded');
  });

  it('returns CURRENT when nothing is overdue', () => {
    const result = determineReceivableTier(
      tierInput({ overdueItemCount: 0, maxOverdueDays: 0, paidRatioPercent: 60 })
    );

    expect(result.tier).toBe('CURRENT');
    expect(result.tierReason).toBe('Nothing overdue · 60% paid');
  });

  it.each([
    [1, 'WATCH'],
    [30, 'WATCH'],
    [31, 'LATE'],
    [60, 'LATE'],
    [61, 'SEVERE'],
    [90, 'SEVERE'],
    [91, 'CRITICAL'],
    [400, 'CRITICAL'],
  ])('maps %i overdue days to %s at a neutral paid ratio', (maxOverdueDays, expected) => {
    const result = determineReceivableTier(tierInput({ maxOverdueDays, paidRatioPercent: 50 }));

    expect(result.tier).toBe(expected);
  });

  it('forces CRITICAL when an overdue customer has never paid anything', () => {
    const result = determineReceivableTier(
      tierInput({ maxOverdueDays: 3, paidRatioPercent: 0, paymentCount: 0 })
    );

    expect(result.tier).toBe('CRITICAL');
    expect(result.tierReason).toBe('3 days late · never paid anything');
  });

  it('escalates one tier when less than 25% has been paid', () => {
    const result = determineReceivableTier(tierInput({ maxOverdueDays: 45, paidRatioPercent: 10 }));

    expect(result.tier).toBe('SEVERE');
    expect(result.tierReason).toBe('45 days late · 10% paid · escalated, under 25% paid');
  });

  it('caps escalation at CRITICAL', () => {
    const result = determineReceivableTier(tierInput({ maxOverdueDays: 200, paidRatioPercent: 5 }));

    expect(result.tier).toBe('CRITICAL');
  });

  it('eases one tier when at least 75% has been paid', () => {
    const result = determineReceivableTier(tierInput({ maxOverdueDays: 75, paidRatioPercent: 80 }));

    expect(result.tier).toBe('LATE');
    expect(result.tierReason).toBe('75 days late · 80% paid · eased, over 75% paid');
  });

  it('never eases an overdue customer below WATCH', () => {
    const result = determineReceivableTier(tierInput({ maxOverdueDays: 5, paidRatioPercent: 99 }));

    expect(result.tier).toBe('WATCH');
  });

  it('ranks tiers from best to worst', () => {
    expect(receivableTierRank('NO_ACTIVITY')).toBeLessThan(receivableTierRank('CURRENT'));
    expect(receivableTierRank('CURRENT')).toBeLessThan(receivableTierRank('WATCH'));
    expect(receivableTierRank('WATCH')).toBeLessThan(receivableTierRank('LATE'));
    expect(receivableTierRank('LATE')).toBeLessThan(receivableTierRank('SEVERE'));
    expect(receivableTierRank('SEVERE')).toBeLessThan(receivableTierRank('CRITICAL'));
  });

  it('uses singular wording for a single late day', () => {
    const result = determineReceivableTier(tierInput({ maxOverdueDays: 1, paidRatioPercent: 50 }));

    expect(result.tierReason).toBe('1 day late · 50% paid');
  });
});
