/**
 * Customer Communication (WhatsApp) — message composition types.
 *
 * Nothing in this feature writes financial data. Overrides change the *message
 * text only*; the backend stays the single source of financial truth.
 */

export type MessageType =
  | 'DEBT_REMINDER'
  | 'LATE_PAYMENT_REMINDER'
  | 'PAYMENT_CONFIRMATION'
  | 'INSTALLMENT_REMINDER'
  | 'SERVICE_UPDATE'
  | 'CUSTOM';

/** What the employee picks. `AR_EN` renders both blocks, Arabic first. */
export type MessageLanguage = 'AR' | 'EN' | 'AR_EN';

/** A single renderable block. `AR_EN` is composed from these two. */
export type TemplateLanguage = 'AR' | 'EN';

export type MessageTone = 'polite' | 'firm' | 'short' | 'friendly';

export type MessageSourceKind = 'TOTAL' | 'DEBT' | 'INSTALLMENT' | 'MANUAL';

export interface MessageSource {
  kind: MessageSourceKind;
  /** Debt id for `DEBT`, installment plan id for `INSTALLMENT`. */
  id?: string | null;
}

/** Every field the employee may override, for the message text only. */
export type MessageField =
  | 'customerName'
  | 'phone'
  | 'amount'
  | 'dateAdded'
  | 'dueDate'
  | 'daysLate'
  | 'paymentDate'
  | 'lastPaymentDate'
  | 'remainingAmount'
  | 'serviceStatus'
  | 'customNote';

/**
 * Placeholders a template may contain.
 *
 * `businessName` is a constant. `daysLateText` is derived from the effective
 * `daysLate` at render time so each language can phrase it naturally
 * ("3 days" / "٣ أيام"); it is not overridable on its own — overriding
 * `daysLate` changes it.
 */
export type MessagePlaceholder = MessageField | 'businessName' | 'daysLateText';

/**
 * Resolved default values, already display-formatted by the layer that reads
 * the financial summary. An empty string means "the backend has no value", and
 * makes the renderer drop the whole line rather than leave a hole.
 */
export type MessageDefaults = Record<MessagePlaceholder, string>;

export type MessageOverrides = Partial<Record<MessageField, string>>;

/** `overrides[field] ?? defaults[field]`, resolved for rendering. */
export type MessageValues = Record<MessagePlaceholder, string>;

/**
 * One editable block per language. Arabic and English never share a textarea —
 * mixing RTL and LTR paragraphs in one box reads badly. They are combined only
 * when copying or opening WhatsApp.
 */
export type MessageBodies = Record<TemplateLanguage, string>;

export interface MessageDraft {
  type: MessageType;
  language: MessageLanguage;
  tone: MessageTone;
  source: MessageSource;
  overrides: MessageOverrides;
  /** Rendered text, then freely edited by the employee. */
  bodies: MessageBodies;
  /** True once the employee edits a body after the last Generate. */
  isBodyDirty: boolean;
}

export type WhatsAppPhoneConfidence = 'high' | 'low';

export type WhatsAppPhoneRejection =
  | 'EMPTY'
  | 'MULTIPLE_NUMBERS'
  | 'UNPARSEABLE'
  | 'TOO_SHORT'
  | 'TOO_LONG';

export type NormalizedWhatsAppPhone =
  | {
      ok: true;
      /** Digits only, country code included, no `+` — exactly what wa.me wants. */
      digits: string;
      /** Human-readable form shown before Open WhatsApp, e.g. `+961 70 123 456`. */
      display: string;
      confidence: WhatsAppPhoneConfidence;
    }
  | { ok: false; reason: WhatsAppPhoneRejection };

export type WhatsAppUrlRejection =
  | 'INVALID_PHONE'
  | 'EMPTY_MESSAGE'
  | 'MESSAGE_TOO_LONG'
  | 'URL_TOO_LONG';

export type WhatsAppUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: WhatsAppUrlRejection };
