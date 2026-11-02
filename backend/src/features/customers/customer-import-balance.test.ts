import { Currency } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { Decimal } from '../financial/domain/money';
import {
  classifyBalance,
  planBalancePayments,
  type CustomerBalanceState,
  type OpenObligation,
} from './customer-import-balance';
import { detectColumnMapping, mapCustomerRows, parseCustomerCsv } from './customer-import.parser';

const open = (
  id: string,
  remaining: string,
  dueDate = '2026-01-01',
  overrides: Partial<OpenObligation> = {}
): OpenObligation => ({
  kind: 'DEBT',
  id,
  currency: Currency.USD,
  dueDate,
  remaining: new Decimal(remaining),
  ...overrides,
});
const state = (...obligations: OpenObligation[]): CustomerBalanceState => ({
  obligations,
  activitySinceLastImport: false,
});
const row = (openingBalance: string, currency: Currency = Currency.USD, hasBalance = true) => ({
  openingBalance,
  currency,
  hasBalance,
  issues: [] as string[],
});

describe('classifyBalance', () => {
  it.each([
    ['100', 'DECREASE', '-100.00'],
    ['0', 'DECREASE', '-200.00'],
    ['200', 'NONE', '0.00'],
    ['260', 'INCREASE', '60.00'],
  ])('compares a $200 customer with a file saying %s', (file, kind, difference) => {
    expect(classifyBalance(row(file), state(open('a', '200')))).toMatchObject({
      kind,
      difference,
      current: '200.00',
    });
  });
  it('treats a first balance as NEW, with or without an existing customer', () => {
    expect(classifyBalance(row('50'))).toMatchObject({ kind: 'NEW', difference: '50.00' });
    expect(classifyBalance(row('50'), state())).toMatchObject({ kind: 'NEW' });
    expect(classifyBalance(row('0'))).toMatchObject({ kind: 'NONE' });
  });
  it('never reads a blank or unmapped balance as zero', () => {
    expect(classifyBalance(row('0', Currency.USD, false), state(open('a', '200')))).toMatchObject({
      kind: 'NO_INFO',
      file: null,
    });
  });
  it('gives an invalid row no money meaning', () => {
    expect(
      classifyBalance({ ...row('oops'), issues: ['Invalid'] }, state(open('a', '200'))).kind
    ).toBe('NO_INFO');
  });
  it('flags any open debt in another currency, even alongside the same currency', () => {
    const lbp = open('b', '89500', '2026-01-02', { currency: Currency.LBP });
    expect(classifyBalance(row('100'), state(lbp)).kind).toBe('CURRENCY_MISMATCH');
    expect(classifyBalance(row('100'), state(open('a', '200'), lbp)).kind).toBe(
      'CURRENCY_MISMATCH'
    );
  });
});

describe('planBalancePayments', () => {
  it('pays the oldest due first across debts and plans, with exact totals', () => {
    const planned = planBalancePayments(
      [
        open('newest', '50', '2026-03-01'),
        open('plan', '30.25', '2026-02-01', { kind: 'PLAN' }),
        open('oldest', '20.50', '2026-01-01'),
      ],
      new Decimal('60.75'),
      Currency.USD
    );
    expect(planned.map((item) => [item.kind, item.id, item.amount.toFixed(2)])).toEqual([
      ['DEBT', 'oldest', '20.50'],
      ['PLAN', 'plan', '30.25'],
      ['DEBT', 'newest', '10.00'],
    ]);
  });
  it('stops once the amount is covered', () => {
    expect(planBalancePayments([open('a', '50'), open('b', '50')], new Decimal('50'), Currency.USD)).toHaveLength(1);
  });
});

describe('customer import parser balance and branch columns', () => {
  const parse = (csv: string) => {
    const document = parseCustomerCsv(csv);
    return mapCustomerRows(document, detectColumnMapping(document.headers));
  };
  it('reports whether a balance was actually supplied', () => {
    const rows = parse('Name,Phone,Opening balance\nAli,03123456,\nMaya,70123456,0\nSam,71123456,5');
    expect(rows.map((item) => item.hasBalance)).toEqual([false, true, true]);
    expect(parse('Name,Phone\nAli,03123456')[0].hasBalance).toBe(false);
  });
  it('detects a branch column in English and Arabic', () => {
    expect(detectColumnMapping(['Name', 'Branch']).branch).toBe(1);
    expect(detectColumnMapping(['الاسم', 'الفرع']).branch).toBe(1);
    expect(parse('Name,Phone,Branch\nAli,03123456, main ')[0].branchValue).toBe('main');
  });
});
