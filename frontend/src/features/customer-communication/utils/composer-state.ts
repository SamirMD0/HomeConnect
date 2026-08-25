import { ServiceJobStatus } from '../../service/types/service.types';
import {
  MessageDraft,
  MessageField,
  MessageSource,
  MessageType,
  NormalizedWhatsAppPhone,
} from '../types/communication.types';
import { buildWhatsAppUrl } from './build-whatsapp-url';
import { normalizeWhatsAppPhone } from './normalize-whatsapp-phone';
import { SOURCE_BOUND_FIELDS } from './resolve-message-defaults';
import { requiresCustomNote } from './service-status-labels';

/**
 * Pure state transitions and gating for the composer. Kept out of the React
 * components so every rule that decides whether Open WhatsApp lights up is
 * unit-testable on its own.
 */

export function createInitialDraft(type: MessageType = 'DEBT_REMINDER'): MessageDraft {
  return {
    type,
    // Arabic default; the employee can switch per message.
    language: 'AR',
    tone: 'polite',
    source: { kind: 'TOTAL', id: null },
    overrides: {},
    bodies: { AR: '', EN: '' },
    isBodyDirty: false,
  };
}

export interface SourceChangeResult {
  draft: MessageDraft;
  /** Overrides that were dropped, so the UI can say so instead of silently changing numbers. */
  resetFields: MessageField[];
}

/**
 * Switching the data source resets the amount/date overrides to the new
 * source's defaults. Carrying a debt's amount over to an installment selection
 * is a data-accuracy bug waiting to happen.
 */
export function applySourceChange(draft: MessageDraft, source: MessageSource): SourceChangeResult {
  const overrides = { ...draft.overrides };
  const resetFields: MessageField[] = [];

  for (const field of SOURCE_BOUND_FIELDS) {
    if (typeof overrides[field] === 'string' && overrides[field] !== '') {
      resetFields.push(field);
      delete overrides[field];
    }
  }

  return { draft: { ...draft, source, overrides }, resetFields };
}

export type GenerateBlockReason = 'CUSTOM_NOTE_REQUIRED' | 'SERVICE_NOTE_REQUIRED';

export interface GenerateGate {
  canGenerate: boolean;
  blockReason: GenerateBlockReason | null;
}

/**
 * `NOT_REPAIRABLE` and `CANCELLED` carry bad news that needs a human sentence,
 * so a bare status label is refused until the employee writes a note.
 */
export function evaluateGenerate(input: {
  type: MessageType;
  serviceStatus?: ServiceJobStatus | null;
  customNote: string;
}): GenerateGate {
  const note = input.customNote.trim();

  if (input.type === 'CUSTOM' && note === '') {
    return { canGenerate: false, blockReason: 'CUSTOM_NOTE_REQUIRED' };
  }

  if (input.type === 'SERVICE_UPDATE' && requiresCustomNote(input.serviceStatus) && note === '') {
    return { canGenerate: false, blockReason: 'SERVICE_NOTE_REQUIRED' };
  }

  return { canGenerate: true, blockReason: null };
}

export type OpenBlockReason =
  | 'NO_PHONE'
  | 'INVALID_PHONE'
  | 'EMPTY_MESSAGE'
  | 'MESSAGE_TOO_LONG'
  | 'URL_TOO_LONG'
  | 'PHONE_NOT_CONFIRMED';

export interface ActionGate {
  canCopy: boolean;
  canOpenWhatsApp: boolean;
  blockReason: OpenBlockReason | null;
  url: string | null;
}

/**
 * True when the employee typed a phone override that resolves to a different
 * number than the saved customer phone. That case demands an explicit confirm.
 */
export function phoneOverrideDiffers(savedPhone: string, effectivePhone: string): boolean {
  if (effectivePhone.trim() === '' || savedPhone.trim() === effectivePhone.trim()) return false;
  const saved = normalizeWhatsAppPhone(savedPhone);
  const effective = normalizeWhatsAppPhone(effectivePhone);
  if (saved.ok && effective.ok) return saved.digits !== effective.digits;
  // One of them is unreadable — treat it as different so the confirm still fires.
  return true;
}

export function evaluateActions(input: {
  body: string;
  phone: NormalizedWhatsAppPhone;
  requiresPhoneConfirmation: boolean;
  phoneConfirmed: boolean;
}): ActionGate {
  // Copy is the guaranteed-working escape hatch: available whenever text exists,
  // whatever the phone situation.
  const canCopy = input.body.trim() !== '';
  const blocked = (blockReason: OpenBlockReason): ActionGate => ({
    canCopy,
    canOpenWhatsApp: false,
    blockReason,
    url: null,
  });

  if (!input.phone.ok) {
    return blocked(input.phone.reason === 'EMPTY' ? 'NO_PHONE' : 'INVALID_PHONE');
  }

  const url = buildWhatsAppUrl(input.phone.digits, input.body);
  if (!url.ok) {
    return blocked(url.reason === 'INVALID_PHONE' ? 'INVALID_PHONE' : url.reason);
  }

  if (input.requiresPhoneConfirmation && !input.phoneConfirmed) {
    return blocked('PHONE_NOT_CONFIRMED');
  }

  return { canCopy, canOpenWhatsApp: true, blockReason: null, url: url.url };
}
