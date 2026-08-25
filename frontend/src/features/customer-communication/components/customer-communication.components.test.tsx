import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CustomerCommunicationSection } from './CustomerCommunicationSection';
import { MessageOverridesPanel } from './MessageOverridesPanel';
import { SelectedDataSummary } from './SelectedDataSummary';
import { WhatsAppMessageComposer } from './WhatsAppMessageComposer';
import { WhatsAppMessageActions, WhatsAppMessageState } from '../hooks/useWhatsAppMessage';
import { MessageDefaults, MessageLanguage, MessageType } from '../types/communication.types';
import { createInitialDraft, evaluateActions, evaluateGenerate } from '../utils/composer-state';
import { normalizeWhatsAppPhone } from '../utils/normalize-whatsapp-phone';
import { activeBodyLanguages, combineMessageBodies } from '../utils/render-template';
import { resolveMessageValues } from '../utils/resolve-message-defaults';

const customer = { id: 'customer-1', name: 'محمد سالم عمار', phone: '70123456' };

const defaults: MessageDefaults = {
  customerName: 'محمد سالم عمار',
  phone: '70123456',
  amount: '$1,250.00',
  remainingAmount: '$1,250.00',
  dateAdded: '02/05/2026',
  dueDate: '02/06/2026',
  daysLate: '71',
  daysLateText: '',
  paymentDate: '',
  lastPaymentDate: '10/08/2026',
  serviceStatus: '',
  customNote: '',
  businessName: 'HomeConnect',
};

const noopActions: WhatsAppMessageActions = {
  setType: () => undefined,
  setLanguage: () => undefined,
  setTone: () => undefined,
  setSource: () => undefined,
  setOverride: () => undefined,
  resetOverrides: () => undefined,
  setServiceStatus: () => undefined,
  setBody: () => undefined,
  generate: () => undefined,
  confirmGenerate: () => undefined,
  cancelGenerate: () => undefined,
  setPhoneConfirmed: () => undefined,
  copyMessage: () => undefined,
  openWhatsApp: () => undefined,
};

interface StateOptions {
  bodies?: { AR: string; EN: string };
  language?: MessageLanguage;
  type?: MessageType;
  phoneOverride?: string;
  savedPhone?: string;
  phoneConfirmed?: boolean;
  requiresPhoneConfirmation?: boolean;
}

function makeState(options: StateOptions = {}): WhatsAppMessageState {
  const type = options.type ?? 'DEBT_REMINDER';
  const language = options.language ?? 'AR';
  const bodies = options.bodies ?? { AR: 'مرحباً محمد سالم عمار،', EN: 'Hello محمد سالم عمار,' };
  const overrides = options.phoneOverride ? { phone: options.phoneOverride } : {};
  const values = resolveMessageValues(defaults, overrides, 'AR');
  const phone = normalizeWhatsAppPhone(values.phone);
  const requiresPhoneConfirmation = options.requiresPhoneConfirmation ?? false;
  const phoneConfirmed = options.phoneConfirmed ?? false;
  const combinedBody = combineMessageBodies(type, language, bodies);

  return {
    draft: { ...createInitialDraft(type), language, overrides, bodies },
    defaults,
    values,
    phone,
    savedPhone: options.savedPhone ?? customer.phone,
    requiresPhoneConfirmation,
    phoneConfirmed,
    actions: evaluateActions({
      body: combinedBody,
      phone,
      requiresPhoneConfirmation,
      phoneConfirmed,
    }),
    generateGate: evaluateGenerate({ type, customNote: '' }),
    sourceNotice: null,
    awaitingOverwriteConfirm: false,
    serviceStatus: null,
    bodyLanguages: activeBodyLanguages(type, language),
    combinedBody,
    debts: [],
    plans: [],
    totalOutstanding: '$1,850.00',
    isLoadingSummary: false,
  };
}

function renderWithQueryClient(node: ReactNode): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

function renderComposer(options: StateOptions = {}): string {
  return renderToStaticMarkup(
    <WhatsAppMessageComposer state={makeState(options)} actions={noopActions} />
  );
}

/**
 * Looks for the rendered `disabled=""` attribute on the button carrying a label,
 * not for the string "disabled" — the Tailwind classes contain `disabled:` too.
 */
function buttonIsDisabled(html: string, label: string): boolean {
  const marker = html.indexOf(label);
  expect(marker).toBeGreaterThan(-1);
  const buttonStart = html.lastIndexOf('<button', marker);
  return html.slice(buttonStart, marker).includes('disabled=""');
}

const openWhatsAppIsDisabled = (html: string) => buttonIsDisabled(html, 'Open WhatsApp');
const copyIsDisabled = (html: string) => buttonIsDisabled(html, 'Copy message');

function textareaTags(html: string): string[] {
  return html.match(/<textarea[^>]*>/g) ?? [];
}

describe('CustomerCommunicationSection', () => {
  it('renders collapsed by default, with the name, phone and no composer', () => {
    const html = renderWithQueryClient(
      <CustomerCommunicationSection customer={customer} isExpanded={false} onToggle={() => undefined} />
    );

    expect(html).toContain('Customer Communication / تواصل الزبون');
    expect(html).toContain('محمد سالم عمار');
    expect(html).toContain('70-123-456');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Message type / نوع الرسالة');
    expect(html).not.toContain('Open WhatsApp');
  });

  it('renders the composer when expanded', () => {
    const html = renderWithQueryClient(
      <CustomerCommunicationSection customer={customer} isExpanded onToggle={() => undefined} />
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Message type / نوع الرسالة');
    expect(html).toContain('Data source / مصدر البيانات');
    expect(html).toContain('Edit message values / تعديل قيم الرسالة');
  });

  it('never renders a direct WhatsApp link — opening always goes through the button', () => {
    const html = renderWithQueryClient(
      <CustomerCommunicationSection customer={customer} isExpanded onToggle={() => undefined} />
    );

    expect(html).not.toContain('href="https://wa.me');
    expect(html).not.toContain('wa.me/');
  });
});

describe('composer layout', () => {
  it('renders the message setup controls', () => {
    const html = renderComposer();

    expect(html).toContain('Debt reminder / تذكير بالدين');
    expect(html).toContain('Late payment reminder / تذكير بتأخير الدفع');
    expect(html).toContain('Custom message / رسالة مخصصة');
    expect(html).toContain('AR + EN');
    expect(html).toContain('Polite / مهذب');
    expect(html).toContain('Total outstanding / إجمالي الرصيد');
    expect(html).toContain('Manual amount / مبلغ يدوي');
  });

  it('shows the selected data summary with the values loaded from the record', () => {
    const html = renderComposer();

    expect(html).toContain('Total outstanding / إجمالي الرصيد');
    expect(html).toContain('$1,250.00');
    expect(html).toContain('02/05/2026');
    expect(html).toContain('02/06/2026');
    expect(html).toContain('Loaded automatically from this customer&#x27;s record');
  });

  it('keeps the override fields collapsed by default', () => {
    const html = renderComposer();

    expect(html).toContain('Edit message values / تعديل قيم الرسالة');
    expect(html).toContain('aria-expanded="false"');
    // None of the override inputs are rendered while collapsed — the values are
    // visible read-only in the summary card instead.
    expect(html).not.toContain('Name in message / الاسم في الرسالة');
    expect(html).not.toContain('Reset overrides / إعادة تعيين القيم');
    expect(html).not.toContain('<input type="text"');
    expect(html).toContain('Days late / أيام التأخير');
  });

  it('keeps the "message only" notice visible even while collapsed', () => {
    expect(renderComposer()).toContain('This changes the message only / هذا يغيّر الرسالة فقط');
  });

  it('offers Generate, Copy and Open WhatsApp', () => {
    const html = renderComposer();

    expect(html).toContain('Generate message / إنشاء الرسالة');
    expect(html).toContain('Copy message / نسخ الرسالة');
    expect(html).toContain('Open WhatsApp / فتح واتساب');
  });

  it('says plainly that the employee sends the message', () => {
    expect(renderComposer()).toContain('You send the message yourself in WhatsApp');
  });
});

describe('SelectedDataSummary', () => {
  it('lists only the values the source actually supplies', () => {
    const html = renderToStaticMarkup(
      <SelectedDataSummary sourceKind="DEBT" defaults={defaults} isLoading={false} />
    );

    expect(html).toContain('Selected debt / الدين المحدد');
    expect(html).toContain('Amount / المبلغ');
    expect(html).toContain('$1,250.00');
    expect(html).toContain('Days late / أيام التأخير');
    expect(html).toContain('71');
    // paymentDate is empty for this source, so it is not shown at all.
    expect(html).not.toContain('Payment date / تاريخ الدفع');
  });

  it('tells the employee that a manual amount is theirs to enter', () => {
    const html = renderToStaticMarkup(
      <SelectedDataSummary
        sourceKind="MANUAL"
        defaults={{ ...defaults, amount: '', dueDate: '', daysLate: '' }}
        isLoading={false}
      />
    );

    expect(html).toContain('Manual amount / مبلغ يدوي');
    expect(html).toContain('Enter the values yourself below / أدخل القيم بنفسك في الأسفل');
  });
});

describe('MessageOverridesPanel', () => {
  const panel = (isOpen: boolean) =>
    renderToStaticMarkup(
      <MessageOverridesPanel
        isOpen={isOpen}
        onToggle={() => undefined}
        overrides={{}}
        defaults={defaults}
        isCustomMessage={false}
        showServiceStatus={false}
        serviceStatus={null}
        resolvedServiceStatus=""
        onOverrideChange={() => undefined}
        onServiceStatusChange={() => undefined}
        onReset={() => undefined}
      />
    );

  it('shows only the toggle and the notice when closed', () => {
    const html = panel(false);

    expect(html).toContain('Edit message values / تعديل قيم الرسالة');
    expect(html).toContain('This changes the message only / هذا يغيّر الرسالة فقط');
    expect(html).not.toContain('<input');
  });

  it('shows every editable value with its default when open', () => {
    const html = panel(true);

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Name in message / الاسم في الرسالة');
    expect(html).toContain('Phone / رقم الهاتف');
    expect(html).toContain('Amount / المبلغ');
    expect(html).toContain('Remaining amount / المبلغ المتبقي');
    expect(html).toContain('Date added / تاريخ الإضافة');
    expect(html).toContain('Due date / تاريخ الاستحقاق');
    expect(html).toContain('Days late / أيام التأخير');
    expect(html).toContain('Payment date / تاريخ الدفع');
    expect(html).toContain('Custom note / ملاحظة مخصصة');
    expect(html).toContain('Reset overrides / إعادة تعيين القيم');

    expect(html).toContain('Default / الافتراضي: محمد سالم عمار');
    expect(html).toContain('Default / الافتراضي: $1,250.00');
    expect(html).toContain('Default / الافتراضي: 02/06/2026');
    expect(html).toContain('Default / الافتراضي: 71');
    // Inputs are empty until the employee types; the default shows as a hint.
    expect(html).not.toContain('readonly');
  });

  it('keeps the service note visible outside the collapsed panel', () => {
    const html = renderToStaticMarkup(
      <MessageOverridesPanel
        isOpen={false}
        onToggle={() => undefined}
        overrides={{}}
        defaults={defaults}
        isCustomMessage={false}
        showServiceStatus
        serviceStatus="NOT_REPAIRABLE"
        resolvedServiceStatus="غير قابل للتصليح"
        onOverrideChange={() => undefined}
        onServiceStatusChange={() => undefined}
        onReset={() => undefined}
      />
    );

    expect(html).toContain('Custom note / ملاحظة مخصصة');
    expect(html).toContain('This status needs a written note before Generate');
  });
});

describe('AR / EN preview layout', () => {
  it('shows one right-to-left textarea for Arabic', () => {
    const tags = textareaTags(renderComposer({ language: 'AR' }));

    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('dir="rtl"');
  });

  it('shows one left-to-right textarea for English', () => {
    const tags = textareaTags(renderComposer({ language: 'EN' }));

    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('dir="ltr"');
  });

  it('shows two separate labelled blocks for AR+EN, never one mixed box', () => {
    const html = renderComposer({ language: 'AR_EN' });
    const tags = textareaTags(html);

    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain('dir="rtl"');
    expect(tags[1]).toContain('dir="ltr"');
    expect(html).toContain('Arabic message / الرسالة العربية');
    expect(html).toContain('English message / الرسالة الإنجليزية');
    expect(html).toContain('Both blocks are sent together, Arabic first');
  });

  it('keeps every preview textarea editable', () => {
    const html = renderComposer({ language: 'AR_EN' });

    expect(html).not.toContain('readonly');
    expect(html).not.toContain('readOnly');
    expect(html).toContain('مرحباً محمد سالم عمار،');
    expect(html).toContain('Hello محمد سالم عمار,');
  });

  it('sends the two blocks joined by a separator', () => {
    const state = makeState({ language: 'AR_EN' });

    expect(state.combinedBody).toBe('مرحباً محمد سالم عمار،\n\n---\n\nHello محمد سالم عمار,');
    expect(state.actions.url).toContain(encodeURIComponent('---'));
  });
});

describe('WhatsApp phone safety', () => {
  it('shows the resolved phone number above the WhatsApp button', () => {
    const html = renderComposer();

    expect(html).toContain('Sending to / سيتم الإرسال إلى');
    expect(html).toContain('+961 70 123 456');
  });

  it('enables both actions for a valid phone and message', () => {
    const html = renderComposer();

    expect(openWhatsAppIsDisabled(html)).toBe(false);
    expect(copyIsDisabled(html)).toBe(false);
  });

  it('disables Open WhatsApp when the message is empty, and Copy with it', () => {
    const html = renderComposer({ bodies: { AR: '', EN: '' } });

    expect(openWhatsAppIsDisabled(html)).toBe(true);
    expect(copyIsDisabled(html)).toBe(true);
    expect(html).toContain('Generate or write the message first');
  });

  it('disables Open WhatsApp for an unreadable phone but keeps Copy available', () => {
    const html = renderComposer({ phoneOverride: '70123456 / 03987654' });

    expect(openWhatsAppIsDisabled(html)).toBe(true);
    expect(copyIsDisabled(html)).toBe(false);
    expect(html).toContain('This field holds more than one number');
  });

  it('gates Open WhatsApp behind a confirmation when the phone differs from the saved one', () => {
    const unconfirmed = renderComposer({
      phoneOverride: '03987654',
      requiresPhoneConfirmation: true,
    });

    expect(unconfirmed).toContain('This differs from the saved number (70123456)');
    expect(unconfirmed).toContain('I confirm this is the correct number');
    expect(openWhatsAppIsDisabled(unconfirmed)).toBe(true);
    expect(unconfirmed).toContain('Confirm the different phone number first');

    const confirmed = renderComposer({
      phoneOverride: '03987654',
      requiresPhoneConfirmation: true,
      phoneConfirmed: true,
    });

    expect(openWhatsAppIsDisabled(confirmed)).toBe(false);
  });
});
