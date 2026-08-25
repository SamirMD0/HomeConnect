import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CustomerFinancialSummary,
  DebtSummaryItem,
  InstallmentPlanSummaryItem,
} from '../../customer-financial/types/customer-financial.types';
import { useCustomerFinancialSummary } from '../../customer-financial/hooks/useCustomerFinancialSummary';
import { useCustomerServiceJobs } from '../../service/hooks/useServiceJobs';
import { ServiceJobStatus } from '../../service/types/service.types';
import {
  MessageDefaults,
  MessageDraft,
  MessageField,
  MessageLanguage,
  MessageSource,
  MessageTone,
  MessageType,
  MessageValues,
  NormalizedWhatsAppPhone,
  TemplateLanguage,
} from '../types/communication.types';
import {
  ActionGate,
  GenerateGate,
  applySourceChange,
  createInitialDraft,
  evaluateActions,
  evaluateGenerate,
  phoneOverrideDiffers,
} from '../utils/composer-state';
import { normalizeWhatsAppPhone } from '../utils/normalize-whatsapp-phone';
import { openWhatsAppLink } from '../utils/open-whatsapp';
import {
  activeBodyLanguages,
  combineMessageBodies,
  renderMessage,
} from '../utils/render-template';
import {
  formatMessageAmount,
  resolveMessageDefaults,
  resolveMessageValues,
} from '../utils/resolve-message-defaults';

/**
 * Owns the composer's local state. Nothing here writes to the server — the only
 * network traffic is the read-only financial summary and service-job queries it
 * already shares with the rest of the customer profile.
 */

/** Session-sticky so the employee is not re-picking Arabic on every customer. */
let lastLanguage: MessageLanguage = 'AR';
let lastTone: MessageTone = 'polite';

export interface WhatsAppMessageState {
  draft: MessageDraft;
  /** Database values, shown in grey beside every override field. */
  defaults: MessageDefaults;
  /** `override ?? default`, what the message actually renders with. */
  values: MessageValues;
  phone: NormalizedWhatsAppPhone;
  /** The saved customer phone, for the "differs from saved" warning. */
  savedPhone: string;
  requiresPhoneConfirmation: boolean;
  phoneConfirmed: boolean;
  actions: ActionGate;
  generateGate: GenerateGate;
  /** Set when a source switch dropped overrides, so the UI can say so. */
  sourceNotice: string | null;
  /** Generate would discard manual edits and is waiting for confirmation. */
  awaitingOverwriteConfirm: boolean;
  serviceStatus: ServiceJobStatus | null;
  /** Which blocks the employee edits: `['AR']`, `['EN']`, or both. */
  bodyLanguages: TemplateLanguage[];
  /** AR and EN joined with a `---` separator; what Copy and wa.me actually use. */
  combinedBody: string;
  debts: DebtSummaryItem[];
  plans: InstallmentPlanSummaryItem[];
  /** Formatted for the source picker; read straight from the backend summary. */
  totalOutstanding: string;
  isLoadingSummary: boolean;
}

export interface WhatsAppMessageActions {
  setType: (type: MessageType) => void;
  setLanguage: (language: MessageLanguage) => void;
  setTone: (tone: MessageTone) => void;
  setSource: (source: MessageSource) => void;
  setOverride: (field: MessageField, value: string) => void;
  resetOverrides: () => void;
  setServiceStatus: (status: ServiceJobStatus | null) => void;
  setBody: (language: TemplateLanguage, body: string) => void;
  generate: () => void;
  confirmGenerate: () => void;
  cancelGenerate: () => void;
  setPhoneConfirmed: (confirmed: boolean) => void;
  copyMessage: () => void;
  openWhatsApp: () => void;
}

export interface UseWhatsAppMessageInput {
  customer: { id: string; name: string; phone: string };
  presetType?: MessageType;
  /** Set to false while the section is collapsed so nothing is fetched unused. */
  enabled?: boolean;
}

const sourceResetNotice =
  'Amount and date values were reset to the new source / تمت إعادة ضبط المبلغ والتواريخ حسب المصدر الجديد';

function primaryLanguageOf(language: MessageLanguage): TemplateLanguage {
  return language === 'EN' ? 'EN' : 'AR';
}

export function useWhatsAppMessage({
  customer,
  presetType,
  enabled = true,
}: UseWhatsAppMessageInput): { state: WhatsAppMessageState; actions: WhatsAppMessageActions } {
  const [draft, setDraft] = useState<MessageDraft>(() => ({
    ...createInitialDraft(presetType),
    language: lastLanguage,
    tone: lastTone,
  }));
  const [serviceStatus, setServiceStatusState] = useState<ServiceJobStatus | null>(null);
  const [serviceStatusTouched, setServiceStatusTouched] = useState(false);
  const [confirmedPhoneDigits, setConfirmedPhoneDigits] = useState<string | null>(null);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const [awaitingOverwriteConfirm, setAwaitingOverwriteConfirm] = useState(false);

  const summaryQuery = useCustomerFinancialSummary(enabled ? customer.id : undefined);
  const summary: CustomerFinancialSummary | undefined = summaryQuery.data;

  // Read-only: the latest service job supplies a sensible status default. The
  // employee can still pick a different one for the message.
  const serviceJobsQuery = useCustomerServiceJobs(enabled ? customer.id : '', { pageSize: 1 });
  const latestServiceStatus = serviceJobsQuery.data?.items?.[0]?.status ?? null;
  const effectiveServiceStatus = serviceStatusTouched ? serviceStatus : latestServiceStatus;

  const defaultsFor = useCallback(
    (language: TemplateLanguage) =>
      resolveMessageDefaults({
        customer,
        summary,
        source: draft.source,
        type: draft.type,
        language,
        serviceStatus: effectiveServiceStatus,
      }),
    [customer, summary, draft.source, draft.type, effectiveServiceStatus]
  );

  const defaults = useMemo(
    () => defaultsFor(primaryLanguageOf(draft.language)),
    [defaultsFor, draft.language]
  );

  const values = useMemo(
    () => resolveMessageValues(defaults, draft.overrides, primaryLanguageOf(draft.language)),
    [defaults, draft.overrides, draft.language]
  );

  const bodyLanguages = useMemo(
    () => activeBodyLanguages(draft.type, draft.language),
    [draft.type, draft.language]
  );

  const combinedBody = useMemo(
    () => combineMessageBodies(draft.type, draft.language, draft.bodies),
    [draft.type, draft.language, draft.bodies]
  );

  const phone = useMemo(() => normalizeWhatsAppPhone(values.phone), [values.phone]);

  const requiresPhoneConfirmation = useMemo(
    () => phoneOverrideDiffers(customer.phone, values.phone),
    [customer.phone, values.phone]
  );

  // Tying the confirmation to the resolved digits means editing the phone again
  // silently withdraws the confirmation, which is the safe default.
  const phoneConfirmed = phone.ok && confirmedPhoneDigits === phone.digits;

  const generateGate = useMemo(
    () =>
      evaluateGenerate({
        type: draft.type,
        serviceStatus: effectiveServiceStatus,
        customNote: values.customNote,
      }),
    [draft.type, effectiveServiceStatus, values.customNote]
  );

  const actionGate = useMemo(
    () =>
      evaluateActions({
        body: combinedBody,
        phone,
        requiresPhoneConfirmation,
        phoneConfirmed,
      }),
    [combinedBody, phone, requiresPhoneConfirmation, phoneConfirmed]
  );

  /**
   * Both blocks are rendered on every Generate, so flipping the language switch
   * afterwards never lands the employee on an empty textarea.
   */
  const writeBody = useCallback(() => {
    const render = (language: TemplateLanguage) =>
      renderMessage({
        type: draft.type,
        language,
        tone: draft.tone,
        values: resolveMessageValues(defaultsFor(language), draft.overrides, language),
      });

    const bodies = { AR: render('AR'), EN: render('EN') };
    setDraft((current) => ({ ...current, bodies, isBodyDirty: false }));
    setAwaitingOverwriteConfirm(false);
  }, [draft.type, draft.tone, draft.overrides, defaultsFor]);

  const generate = useCallback(() => {
    if (!generateGate.canGenerate) {
      toast.error(
        generateGate.blockReason === 'SERVICE_NOTE_REQUIRED'
          ? 'This status needs a written note before sending / هذه الحالة تحتاج ملاحظة مكتوبة قبل الإرسال'
          : 'Write the message text first / اكتب نص الرسالة أولاً'
      );
      return;
    }

    // Manual edits win until the employee explicitly asks to regenerate.
    if (draft.isBodyDirty && combinedBody.trim() !== '') {
      setAwaitingOverwriteConfirm(true);
      return;
    }

    writeBody();
  }, [generateGate, draft.isBodyDirty, combinedBody, writeBody]);

  const actions: WhatsAppMessageActions = {
    setType: (type) => {
      setDraft((current) => ({ ...current, type }));
      setSourceNotice(null);
    },
    setLanguage: (language) => {
      lastLanguage = language;
      setDraft((current) => ({ ...current, language }));
    },
    setTone: (tone) => {
      lastTone = tone;
      setDraft((current) => ({ ...current, tone }));
    },
    setSource: (source) => {
      setDraft((current) => {
        const { draft: next, resetFields } = applySourceChange(current, source);
        setSourceNotice(resetFields.length > 0 ? sourceResetNotice : null);
        return next;
      });
    },
    setOverride: (field, value) => {
      setDraft((current) => ({ ...current, overrides: { ...current.overrides, [field]: value } }));
    },
    resetOverrides: () => {
      setDraft((current) => ({ ...current, overrides: {} }));
      setConfirmedPhoneDigits(null);
      setSourceNotice(null);
    },
    setServiceStatus: (status) => {
      setServiceStatusTouched(true);
      setServiceStatusState(status);
    },
    setBody: (language, body) =>
      setDraft((current) => ({
        ...current,
        bodies: { ...current.bodies, [language]: body },
        isBodyDirty: true,
      })),
    generate,
    confirmGenerate: writeBody,
    cancelGenerate: () => setAwaitingOverwriteConfirm(false),
    setPhoneConfirmed: (confirmed) =>
      setConfirmedPhoneDigits(confirmed && phone.ok ? phone.digits : null),
    copyMessage: () => {
      if (!actionGate.canCopy) return;
      void navigator.clipboard?.writeText(combinedBody);
      toast.success('Message copied / تم نسخ الرسالة');
    },
    openWhatsApp: () => {
      if (!actionGate.canOpenWhatsApp || !actionGate.url) return;
      void openWhatsAppLink(actionGate.url).then((result) => {
        if (!result.opened) {
          toast.error(result.error ?? 'WhatsApp could not be opened / تعذّر فتح واتساب');
        }
      });
    },
  };

  const state: WhatsAppMessageState = {
    draft,
    defaults,
    values,
    phone,
    savedPhone: customer.phone,
    requiresPhoneConfirmation,
    phoneConfirmed,
    actions: actionGate,
    generateGate,
    sourceNotice,
    awaitingOverwriteConfirm,
    serviceStatus: effectiveServiceStatus,
    bodyLanguages,
    combinedBody,
    debts: summary?.debts ?? [],
    plans: summary?.installmentPlans ?? [],
    totalOutstanding: formatMessageAmount(summary?.summary.totalOutstanding) || '—',
    isLoadingSummary: summaryQuery.isLoading,
  };

  return { state, actions };
}
