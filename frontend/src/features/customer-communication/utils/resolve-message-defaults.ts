import { CustomerFinancialSummary } from '../../customer-financial/types/customer-financial.types';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { ServiceJobStatus } from '../../service/types/service.types';
import {
  MessageDefaults,
  MessageField,
  MessageOverrides,
  MessageSource,
  MessageType,
  MessageValues,
  TemplateLanguage,
} from '../types/communication.types';
import { BUSINESS_NAME } from './message-templates';
import { serviceStatusForMessage } from './service-status-labels';

/**
 * Turns the values the backend already computed into message defaults.
 *
 * This layer **formats but never computes**. Amounts arrive as decimal strings
 * and are handed straight to the existing `formatMoney`; nothing here re-derives
 * a balance, a days-late count, or any other financial fact. If a number is not
 * in the summary it is not in the message — the employee types it as a manual
 * override instead.
 */

export const MESSAGE_FIELDS: MessageField[] = [
  'customerName',
  'phone',
  'amount',
  'remainingAmount',
  'dateAdded',
  'dueDate',
  'daysLate',
  'paymentDate',
  'lastPaymentDate',
  'serviceStatus',
  'customNote',
];

/** Fields that describe the selected obligation and so follow the data source. */
export const SOURCE_BOUND_FIELDS: MessageField[] = [
  'amount',
  'remainingAmount',
  'dateAdded',
  'dueDate',
  'daysLate',
  'paymentDate',
];

/** `DD/MM/YYYY`, matching the rest of the customer profile. */
export function formatMessageDate(value: string | null | undefined): string {
  if (!value) return '';
  // Business dates arrive as `YYYY-MM-DD`, timestamps as full ISO strings.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return '';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function formatMessageAmount(value: string | null | undefined): string {
  if (typeof value !== 'string' || value.trim() === '') return '';
  const formatted = formatMoney(value);
  // `formatMoney` returns its own placeholder for unusable input; an em dash in
  // a customer message is worse than dropping the line.
  return formatted === '—' ? '' : formatted;
}

function formatDaysLate(days: number | null | undefined): string {
  return typeof days === 'number' && days > 0 ? String(days) : '';
}

/**
 * "10 days" / "١٠ أيام" rather than a bare number, so the sentence reads
 * naturally in both languages. Arabic uses the dual and the 3–10 plural, which
 * is where a bare number sounds most wrong.
 *
 * A non-numeric override (the employee typed something else) is passed through
 * untouched — their wording wins.
 */
export function formatDaysLateText(daysLate: string, language: TemplateLanguage): string {
  const value = daysLate.trim();
  if (value === '') return '';

  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return value;

  if (language === 'EN') return days === 1 ? '1 day' : `${days} days`;
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومين';
  return days <= 10 ? `${days} أيام` : `${days} يوم`;
}

export interface ResolveMessageDefaultsInput {
  customer: { name: string; phone: string };
  summary?: CustomerFinancialSummary | null;
  source: MessageSource;
  type: MessageType;
  language: TemplateLanguage;
  serviceStatus?: ServiceJobStatus | null;
}

function emptyDefaults(customer: { name: string; phone: string }): MessageDefaults {
  return {
    customerName: customer.name ?? '',
    phone: customer.phone ?? '',
    amount: '',
    remainingAmount: '',
    dateAdded: '',
    dueDate: '',
    daysLate: '',
    paymentDate: '',
    lastPaymentDate: '',
    serviceStatus: '',
    customNote: '',
    businessName: BUSINESS_NAME,
    // Derived from `daysLate` in `resolveMessageValues`, once overrides apply.
    daysLateText: '',
  };
}

export function resolveMessageDefaults({
  customer,
  summary,
  source,
  type,
  language,
  serviceStatus,
}: ResolveMessageDefaultsInput): MessageDefaults {
  const defaults = emptyDefaults(customer);
  defaults.serviceStatus = serviceStatusForMessage(serviceStatus, language);

  if (!summary) return defaults;

  defaults.lastPaymentDate = formatMessageDate(summary.summary.lastPaymentDate);

  if (source.kind === 'TOTAL') {
    defaults.amount = formatMessageAmount(summary.summary.totalOutstanding);
    defaults.remainingAmount = formatMessageAmount(summary.summary.totalOutstanding);
    defaults.dueDate = formatMessageDate(summary.summary.nextDueDate);
    // Selection, not arithmetic: the oldest overdue item's own `daysOverdue`.
    const oldestOverdue = summary.overdueItems.reduce<number | null>(
      (worst, item) => (worst === null || item.daysOverdue > worst ? item.daysOverdue : worst),
      null
    );
    defaults.daysLate = formatDaysLate(oldestOverdue);
  }

  if (source.kind === 'DEBT' && source.id) {
    const debt = summary.debts.find((item) => item.id === source.id);
    if (debt) {
      defaults.amount = formatMessageAmount(debt.remainingBalance);
      defaults.remainingAmount = formatMessageAmount(debt.remainingBalance);
      defaults.dateAdded = formatMessageDate(debt.createdAt);
      defaults.dueDate = formatMessageDate(debt.dueDate);
      const overdue = summary.overdueItems.find(
        (item) => item.type === 'DEBT' && item.obligationId === debt.id
      );
      defaults.daysLate = formatDaysLate(overdue?.daysOverdue);
    }
  }

  if (source.kind === 'INSTALLMENT' && source.id) {
    const plan = summary.installmentPlans.find((item) => item.id === source.id);
    if (plan) {
      const next = plan.scheduleSummary.nextInstallment;
      defaults.amount = formatMessageAmount(next?.remainingAmount);
      defaults.remainingAmount = formatMessageAmount(plan.remainingBalance);
      defaults.dateAdded = formatMessageDate(plan.startDate);
      defaults.dueDate = formatMessageDate(next?.dueDate ?? plan.nextDueDate);
      const overdue = summary.overdueItems.find(
        (item) => item.type === 'INSTALLMENT' && item.obligationId === next?.id
      );
      defaults.daysLate = formatDaysLate(overdue?.daysOverdue);
    }
  }

  // A confirmation is about the payment that arrived, so the amount and date come
  // from the most recent payment the backend reported; the remaining balance
  // stays whatever the chosen source says it is.
  if (type === 'PAYMENT_CONFIRMATION') {
    const latestPayment = summary.recentPayments.find((payment) => payment.voidedAt === null);
    defaults.paymentDate = formatMessageDate(
      latestPayment?.paymentDate ?? summary.summary.lastPaymentDate
    );
    if (latestPayment) defaults.amount = formatMessageAmount(latestPayment.totalAmount);
  }

  return defaults;
}

/**
 * `effective(field) = override ?? default`.
 *
 * Returns a new object — `defaults` is never mutated. A cleared override falls
 * back to the default rather than becoming empty.
 */
export function resolveMessageValues(
  defaults: MessageDefaults,
  overrides: MessageOverrides,
  language: TemplateLanguage
): MessageValues {
  const values: MessageValues = { ...defaults };
  for (const field of MESSAGE_FIELDS) {
    const override = overrides[field];
    if (typeof override === 'string' && override.trim() !== '') values[field] = override.trim();
  }
  // Derived last, so an overridden day count still reads naturally.
  values.daysLateText = formatDaysLateText(values.daysLate, language);
  return values;
}
