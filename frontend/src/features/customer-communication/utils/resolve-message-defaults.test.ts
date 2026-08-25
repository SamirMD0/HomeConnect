import { describe, expect, it } from 'vitest';
import {
  CustomerFinancialSummary,
  DebtSummaryItem,
  InstallmentPlanSummaryItem,
} from '../../customer-financial/types/customer-financial.types';
import {
  formatDaysLateText,
  formatMessageAmount,
  formatMessageDate,
  resolveMessageDefaults,
  resolveMessageValues,
} from './resolve-message-defaults';

const user = { id: 'u1', name: 'Employee', username: 'employee' };

const debt: DebtSummaryItem = {
  id: 'debt-1',
  kind: 'STANDARD',
  description: 'Fridge',
  originalAmount: '1500.00',
  totalPaid: '250.00',
  remainingBalance: '1250.00',
  adminDebt: '0.00',
  dueDate: '2026-06-02',
  status: 'OVERDUE',
  calculatedStatus: 'OVERDUE',
  storedStatus: 'UNPAID',
  notes: null,
  createdAt: '2026-05-02T09:15:00.000Z',
  updatedAt: '2026-05-02T09:15:00.000Z',
  createdBy: user,
  cancellation: null,
};

const plan: InstallmentPlanSummaryItem = {
  id: 'plan-1',
  description: 'Washing machine',
  totalAmount: '900.00',
  totalPaid: '300.00',
  remainingBalance: '600.00',
  startDate: '2026-03-15',
  installmentCount: 3,
  frequency: 'MONTHLY',
  completedInstallmentCount: 1,
  overdueInstallmentCount: 1,
  nextDueDate: '2026-07-15',
  status: 'OVERDUE',
  calculatedStatus: 'OVERDUE',
  storedStatus: 'ACTIVE',
  notes: null,
  createdAt: '2026-03-15T00:00:00.000Z',
  updatedAt: '2026-03-15T00:00:00.000Z',
  createdBy: user,
  cancellation: null,
  scheduleSummary: {
    totalInstallments: 3,
    completedInstallments: 1,
    remainingInstallments: 2,
    nextInstallment: {
      id: 'inst-2',
      installmentNumber: 2,
      dueDate: '2026-07-15',
      remainingAmount: '300.00',
      status: 'OVERDUE',
    },
  },
};

const summary: CustomerFinancialSummary = {
  customer: {
    id: 'c1',
    name: 'محمد سالم عمار',
    phone: '70123456',
    address: null,
    notes: null,
    isActive: true,
  },
  summary: {
    totalOutstanding: '1850.00',
    singleDebtOutstanding: '1250.00',
    installmentPlanOutstanding: '600.00',
    totalPrepaidAdminDebt: '0.00',
    totalPaid: '550.00',
    activeDebtCount: 1,
    activePrepaidCount: 0,
    activePlanCount: 1,
    overdueDebtCount: 1,
    overdueInstallmentCount: 1,
    nextDueDate: '2026-06-02',
    nextDueAmount: '1250.00',
    lastPaymentDate: '2026-08-10',
  },
  debts: [debt],
  installmentPlans: [plan],
  overdueItems: [
    {
      type: 'DEBT',
      obligationId: 'debt-1',
      planId: null,
      description: 'Fridge',
      dueDate: '2026-06-02',
      originalDueAmount: '1500.00',
      paidAmount: '250.00',
      remainingAmount: '1250.00',
      daysOverdue: 71,
      calculatedStatus: 'OVERDUE',
    },
    {
      type: 'INSTALLMENT',
      obligationId: 'inst-2',
      planId: 'plan-1',
      description: 'Washing machine',
      dueDate: '2026-07-15',
      originalDueAmount: '300.00',
      paidAmount: '0.00',
      remainingAmount: '300.00',
      daysOverdue: 28,
      calculatedStatus: 'OVERDUE',
    },
  ],
  nextDue: null,
  recentPayments: [
    {
      id: 'pay-1',
      totalAmount: '250.00',
      paymentDate: '2026-08-10',
      paymentMethod: 'CASH',
      reference: null,
      notes: null,
      idempotencyKey: null,
      createdAt: '2026-08-10T10:00:00.000Z',
      createdBy: user,
      voidedAt: null,
      voidReason: null,
      voidedBy: null,
      allocations: [],
    },
  ],
};

const customer = { name: 'محمد سالم عمار', phone: '70123456' };

describe('value formatting', () => {
  it('formats dates as DD/MM/YYYY from both business dates and timestamps', () => {
    expect(formatMessageDate('2026-06-02')).toBe('02/06/2026');
    expect(formatMessageDate('2026-05-02T09:15:00.000Z')).toBe('02/05/2026');
    expect(formatMessageDate(null)).toBe('');
    expect(formatMessageDate('not a date')).toBe('');
  });

  it('formats amounts with the existing app currency formatter', () => {
    expect(formatMessageAmount('1250.00')).toBe('$1,250.00');
    expect(formatMessageAmount('')).toBe('');
    expect(formatMessageAmount(null)).toBe('');
  });

  it('phrases the days-late count naturally in English', () => {
    expect(formatDaysLateText('1', 'EN')).toBe('1 day');
    expect(formatDaysLateText('10', 'EN')).toBe('10 days');
    expect(formatDaysLateText('', 'EN')).toBe('');
  });

  it('phrases the days-late count naturally in Arabic, including the dual', () => {
    expect(formatDaysLateText('1', 'AR')).toBe('يوم واحد');
    expect(formatDaysLateText('2', 'AR')).toBe('يومين');
    expect(formatDaysLateText('7', 'AR')).toBe('7 أيام');
    expect(formatDaysLateText('71', 'AR')).toBe('71 يوم');
    expect(formatDaysLateText('', 'AR')).toBe('');
  });

  it('passes a non-numeric override through untouched', () => {
    expect(formatDaysLateText('more than a month', 'EN')).toBe('more than a month');
    expect(formatDaysLateText('0', 'EN')).toBe('0');
  });
});

describe('resolveMessageDefaults', () => {
  it('uses the total outstanding for the TOTAL source', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'TOTAL' },
      type: 'DEBT_REMINDER',
      language: 'AR',
    });

    expect(defaults.amount).toBe('$1,850.00');
    expect(defaults.dueDate).toBe('02/06/2026');
    expect(defaults.daysLate).toBe('71');
    expect(defaults.customerName).toBe('محمد سالم عمار');
    expect(defaults.businessName).toBe('HomeConnect');
  });

  it('uses the selected debt for the DEBT source', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'DEBT', id: 'debt-1' },
      type: 'DEBT_REMINDER',
      language: 'AR',
    });

    expect(defaults.amount).toBe('$1,250.00');
    expect(defaults.dateAdded).toBe('02/05/2026');
    expect(defaults.dueDate).toBe('02/06/2026');
    expect(defaults.daysLate).toBe('71');
  });

  it('uses the next installment for the INSTALLMENT source', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'INSTALLMENT', id: 'plan-1' },
      type: 'INSTALLMENT_REMINDER',
      language: 'AR',
    });

    expect(defaults.amount).toBe('$300.00');
    expect(defaults.remainingAmount).toBe('$600.00');
    expect(defaults.dueDate).toBe('15/07/2026');
    expect(defaults.daysLate).toBe('28');
  });

  it('leaves amounts and dates empty for a manual source', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'MANUAL' },
      type: 'DEBT_REMINDER',
      language: 'AR',
    });

    expect(defaults.amount).toBe('');
    expect(defaults.dueDate).toBe('');
    expect(defaults.daysLate).toBe('');
  });

  it('takes the payment amount and date from the latest payment for a confirmation', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'TOTAL' },
      type: 'PAYMENT_CONFIRMATION',
      language: 'AR',
    });

    expect(defaults.amount).toBe('$250.00');
    expect(defaults.paymentDate).toBe('10/08/2026');
    expect(defaults.remainingAmount).toBe('$1,850.00');
  });

  it('ignores a voided payment when confirming', () => {
    const voided = {
      ...summary,
      recentPayments: [{ ...summary.recentPayments[0], voidedAt: '2026-08-11T00:00:00.000Z' }],
    };
    const defaults = resolveMessageDefaults({
      customer,
      summary: voided,
      source: { kind: 'TOTAL' },
      type: 'PAYMENT_CONFIRMATION',
      language: 'AR',
    });

    expect(defaults.amount).toBe('$1,850.00');
  });

  it('resolves the service status into the message language', () => {
    const arabic = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'TOTAL' },
      type: 'SERVICE_UPDATE',
      language: 'AR',
      serviceStatus: 'READY_FOR_PICKUP',
    });
    const english = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'TOTAL' },
      type: 'SERVICE_UPDATE',
      language: 'EN',
      serviceStatus: 'READY_FOR_PICKUP',
    });

    expect(arabic.serviceStatus).toBe('جاهز للاستلام');
    expect(english.serviceStatus).toBe('Ready for pickup');
  });

  it('survives a missing financial summary', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary: null,
      source: { kind: 'TOTAL' },
      type: 'DEBT_REMINDER',
      language: 'AR',
    });

    expect(defaults.customerName).toBe('محمد سالم عمار');
    expect(defaults.amount).toBe('');
  });
});

describe('resolveMessageValues', () => {
  it('prefers an override over the default', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'TOTAL' },
      type: 'DEBT_REMINDER',
      language: 'AR',
    });

    const values = resolveMessageValues(defaults, { customerName: 'أبو سالم', amount: '1,000,000' }, 'AR');

    expect(values.customerName).toBe('أبو سالم');
    expect(values.amount).toBe('1,000,000');
    expect(values.dueDate).toBe('02/06/2026');
  });

  it('never mutates the defaults object', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'TOTAL' },
      type: 'DEBT_REMINDER',
      language: 'AR',
    });
    const snapshot = { ...defaults };

    const values = resolveMessageValues(defaults, { customerName: 'أبو سالم' }, 'AR');

    expect(defaults).toEqual(snapshot);
    expect(values).not.toBe(defaults);
  });

  it('falls back to the default when an override is cleared', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'TOTAL' },
      type: 'DEBT_REMINDER',
      language: 'AR',
    });

    expect(resolveMessageValues(defaults, { customerName: '' }, 'AR').customerName).toBe(
      'محمد سالم عمار'
    );
    expect(resolveMessageValues(defaults, { customerName: '   ' }, 'AR').customerName).toBe(
      'محمد سالم عمار'
    );
  });

  it('reads financial values only — no re-derived balances', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'DEBT', id: 'debt-1' },
      type: 'DEBT_REMINDER',
      language: 'AR',
    });

    // remainingBalance verbatim from the backend, not originalAmount - totalPaid
    // recomputed in the browser.
    expect(defaults.amount).toBe('$1,250.00');
    expect(defaults.remainingAmount).toBe('$1,250.00');
  });

  it('auto-loads every message value for a selected debt with no typing', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'DEBT', id: 'debt-1' },
      type: 'DEBT_REMINDER',
      language: 'EN',
    });

    // No overrides at all: the employee should not have to fill anything in.
    const values = resolveMessageValues(defaults, {}, 'EN');

    expect(values).toMatchObject({
      customerName: 'محمد سالم عمار',
      phone: '70123456',
      amount: '$1,250.00',
      remainingAmount: '$1,250.00',
      dateAdded: '02/05/2026',
      dueDate: '02/06/2026',
      daysLate: '71',
      daysLateText: '71 days',
      lastPaymentDate: '10/08/2026',
    });
  });

  it('derives the days-late wording from an overridden day count', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'DEBT', id: 'debt-1' },
      type: 'DEBT_REMINDER',
      language: 'AR',
    });

    expect(resolveMessageValues(defaults, { daysLate: '2' }, 'AR').daysLateText).toBe('يومين');
  });

  it('restores the selected source values when overrides are cleared', () => {
    const defaults = resolveMessageDefaults({
      customer,
      summary,
      source: { kind: 'DEBT', id: 'debt-1' },
      type: 'DEBT_REMINDER',
      language: 'EN',
    });

    const overridden = resolveMessageValues(defaults, { amount: '$500.00', dueDate: '01/01/2027' }, 'EN');
    const reset = resolveMessageValues(defaults, {}, 'EN');

    expect(overridden.amount).toBe('$500.00');
    expect(reset.amount).toBe('$1,250.00');
    expect(reset.dueDate).toBe('02/06/2026');
  });
});
