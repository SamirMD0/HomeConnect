import { describe, expect, it } from 'vitest';
import {
  applySourceChange,
  createInitialDraft,
  evaluateActions,
  evaluateGenerate,
  phoneOverrideDiffers,
} from './composer-state';
import { normalizeWhatsAppPhone } from './normalize-whatsapp-phone';
import { MAX_MESSAGE_LENGTH } from './message-templates';

const validPhone = normalizeWhatsAppPhone('70123456');

describe('createInitialDraft', () => {
  it('defaults to an Arabic polite debt reminder on the total outstanding', () => {
    const draft = createInitialDraft();
    expect(draft.type).toBe('DEBT_REMINDER');
    expect(draft.language).toBe('AR');
    expect(draft.tone).toBe('polite');
    expect(draft.source.kind).toBe('TOTAL');
    expect(draft.overrides).toEqual({});
    expect(draft.isBodyDirty).toBe(false);
  });

  it('accepts a preset type for the header shortcut', () => {
    expect(createInitialDraft('SERVICE_UPDATE').type).toBe('SERVICE_UPDATE');
  });
});

describe('applySourceChange', () => {
  it('resets amount and date overrides and reports what it dropped', () => {
    const draft = {
      ...createInitialDraft(),
      overrides: { customerName: 'أبو سالم', amount: '1,000', dueDate: '01/01/2026' },
    };

    const { draft: next, resetFields } = applySourceChange(draft, { kind: 'DEBT', id: 'debt-1' });

    expect(next.source).toEqual({ kind: 'DEBT', id: 'debt-1' });
    expect(next.overrides).toEqual({ customerName: 'أبو سالم' });
    expect(resetFields).toEqual(['amount', 'dueDate']);
  });

  it('does not mutate the previous draft', () => {
    const draft = { ...createInitialDraft(), overrides: { amount: '1,000' } };
    applySourceChange(draft, { kind: 'MANUAL' });
    expect(draft.overrides).toEqual({ amount: '1,000' });
  });

  it('reports nothing when there was nothing to reset', () => {
    const { resetFields } = applySourceChange(createInitialDraft(), { kind: 'MANUAL' });
    expect(resetFields).toEqual([]);
  });
});

describe('evaluateGenerate', () => {
  it('requires text for a custom message', () => {
    expect(evaluateGenerate({ type: 'CUSTOM', customNote: '' })).toEqual({
      canGenerate: false,
      blockReason: 'CUSTOM_NOTE_REQUIRED',
    });
    expect(evaluateGenerate({ type: 'CUSTOM', customNote: 'hello' }).canGenerate).toBe(true);
  });

  it('refuses to send bad news as a bare status label', () => {
    for (const serviceStatus of ['NOT_REPAIRABLE', 'CANCELLED'] as const) {
      expect(evaluateGenerate({ type: 'SERVICE_UPDATE', serviceStatus, customNote: '' })).toEqual({
        canGenerate: false,
        blockReason: 'SERVICE_NOTE_REQUIRED',
      });
      expect(
        evaluateGenerate({ type: 'SERVICE_UPDATE', serviceStatus, customNote: 'نعتذر...' })
          .canGenerate
      ).toBe(true);
    }
  });

  it('allows an ordinary service status without a note', () => {
    expect(
      evaluateGenerate({ type: 'SERVICE_UPDATE', serviceStatus: 'READY_FOR_PICKUP', customNote: '' })
        .canGenerate
    ).toBe(true);
  });
});

describe('phoneOverrideDiffers', () => {
  it('is false when the override resolves to the same number', () => {
    expect(phoneOverrideDiffers('70123456', '70123456')).toBe(false);
    expect(phoneOverrideDiffers('70123456', '+961 70 123 456')).toBe(false);
    expect(phoneOverrideDiffers('70123456', '')).toBe(false);
  });

  it('is true when the override resolves to a different number', () => {
    expect(phoneOverrideDiffers('70123456', '03987654')).toBe(true);
  });

  it('is true when either side cannot be read', () => {
    expect(phoneOverrideDiffers('call the shop', '70123456')).toBe(true);
  });
});

describe('evaluateActions', () => {
  const base = { requiresPhoneConfirmation: false, phoneConfirmed: false };

  it('enables both actions for a valid phone and message', () => {
    const gate = evaluateActions({ ...base, body: 'مرحباً', phone: validPhone });
    expect(gate).toMatchObject({ canCopy: true, canOpenWhatsApp: true, blockReason: null });
    expect(gate.url).toContain('https://wa.me/96170123456?text=');
  });

  it('keeps Copy available whenever text exists, even with no phone', () => {
    const gate = evaluateActions({
      ...base,
      body: 'مرحباً',
      phone: normalizeWhatsAppPhone(''),
    });
    expect(gate.canCopy).toBe(true);
    expect(gate.canOpenWhatsApp).toBe(false);
    expect(gate.blockReason).toBe('NO_PHONE');
  });

  it('blocks Open WhatsApp for an unreadable phone', () => {
    const gate = evaluateActions({
      ...base,
      body: 'مرحباً',
      phone: normalizeWhatsAppPhone('70123456 / 03987654'),
    });
    expect(gate.canOpenWhatsApp).toBe(false);
    expect(gate.blockReason).toBe('INVALID_PHONE');
  });

  it('blocks both actions for an empty message', () => {
    const gate = evaluateActions({ ...base, body: '   ', phone: validPhone });
    expect(gate.canCopy).toBe(false);
    expect(gate.canOpenWhatsApp).toBe(false);
    expect(gate.blockReason).toBe('EMPTY_MESSAGE');
  });

  it('blocks Open WhatsApp for an over-long message but still allows Copy', () => {
    const gate = evaluateActions({
      ...base,
      body: 'a'.repeat(MAX_MESSAGE_LENGTH + 1),
      phone: validPhone,
    });
    expect(gate.canCopy).toBe(true);
    expect(gate.canOpenWhatsApp).toBe(false);
    expect(gate.blockReason).toBe('MESSAGE_TOO_LONG');
  });

  it('gates Open WhatsApp behind confirmation when the phone was overridden', () => {
    const unconfirmed = evaluateActions({
      body: 'مرحباً',
      phone: validPhone,
      requiresPhoneConfirmation: true,
      phoneConfirmed: false,
    });
    expect(unconfirmed.canOpenWhatsApp).toBe(false);
    expect(unconfirmed.blockReason).toBe('PHONE_NOT_CONFIRMED');
    expect(unconfirmed.url).toBeNull();

    const confirmed = evaluateActions({
      body: 'مرحباً',
      phone: validPhone,
      requiresPhoneConfirmation: true,
      phoneConfirmed: true,
    });
    expect(confirmed.canOpenWhatsApp).toBe(true);
  });
});
