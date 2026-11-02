import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  CustomerMergeForm,
  defaultBalanceChoice,
  defaultKeepId,
  formatMergeBalances,
  mergeConfirmMessage,
  mergeOutcome,
} from './CustomerMergeDialog';
import type { CustomerMergeCandidate } from '../api/customers.api';

const noCounts = {
  sales_orders: 0,
  sales_returns: 0,
  cash_refunds: 0,
  customer_credits: 0,
  payments: 0,
  debts: 1,
  installment_plans: 0,
  service_jobs: 0,
};
const main: CustomerMergeCandidate = {
  id: 'main',
  name: 'Najla Khatib',
  phone: '71194334',
  branchId: 'a',
  branchName: 'Main branch',
  balances: [{ currency: 'USD', amount: '125.00' }],
  cancellable: [],
  counts: { ...noCounts, payments: 2 },
};
const barja: CustomerMergeCandidate = {
  ...main,
  id: 'barja',
  phone: '',
  branchId: 'b',
  branchName: 'BARJA',
  cancellable: [{ currency: 'USD', amount: '125.00' }],
  counts: noCounts,
};
const render = (overrides: Partial<React.ComponentProps<typeof CustomerMergeForm>> = {}) =>
  renderToStaticMarkup(
    <CustomerMergeForm
      customers={[main, barja]}
      keepId="main"
      otherId="barja"
      balance="KEEP_ONLY"
      busy={false}
      error=""
      onKeep={vi.fn()}
      onOther={vi.fn()}
      onBalance={vi.fn()}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />
  );

describe('customer merge', () => {
  it('suggests keeping the record with more history', () => {
    expect(defaultKeepId([barja, main])).toBe('main');
  });
  it('suggests keeping one balance when both match, and adding when they differ', () => {
    expect(defaultBalanceChoice(main, barja)).toBe('KEEP_ONLY');
    expect(
      defaultBalanceChoice(main, { ...barja, balances: [{ currency: 'USD', amount: '100.00' }] })
    ).toBe('ADD_BOTH');
  });
  it('previews both balance choices', () => {
    expect(formatMergeBalances(mergeOutcome(main, barja, 'ADD_BOTH').total)).toBe('$250.00');
    expect(formatMergeBalances(mergeOutcome(main, barja, 'KEEP_ONLY').total)).toBe('$125.00');
  });
  it('carries over what cannot be cancelled, and warns', () => {
    const partPaid = { ...barja, cancellable: [] };
    const outcome = mergeOutcome(main, partPaid, 'KEEP_ONLY');
    expect(formatMergeBalances(outcome.total)).toBe('$250.00');
    expect(render({ customers: [main, partPaid] })).toContain("can&#x27;t be cancelled");
  });
  it('keeps currencies apart', () => {
    const lbp = {
      ...barja,
      balances: [{ currency: 'LBP' as const, amount: '89500' }],
      cancellable: [],
    };
    expect(formatMergeBalances(mergeOutcome(main, lbp, 'ADD_BOTH').total)).toBe(
      '$125.00 + 89,500 LBP'
    );
  });
  it('shows both records and the result before confirming', () => {
    const html = render();
    expect(html).toContain('Main branch');
    expect(html).toContain('BARJA');
    expect(html).toContain('Balance after the merge: $125.00');
    expect(html).toContain('cannot be undone');
  });
  it('offers a choice when more than two customers share the name', () => {
    const third = { ...barja, id: 'third', branchName: 'Third' };
    expect(render({ customers: [main, barja, third] })).toContain('Customer to merge');
    expect(render()).not.toContain('Customer to merge');
  });
  it('says so when the other record is gone', () => {
    expect(render({ customers: [main] })).toContain('No other customer');
  });
  it('states the outcome in the confirm popup', () => {
    const message = mergeConfirmMessage(main, barja, mergeOutcome(main, barja, 'KEEP_ONLY').total);
    expect(message).toContain('BARJA');
    expect(message).toContain('$125.00');
    expect(message).toContain('cannot be undone');
  });
});
