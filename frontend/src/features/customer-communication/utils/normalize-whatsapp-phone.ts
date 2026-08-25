import { NormalizedWhatsAppPhone } from '../types/communication.types';

/**
 * WhatsApp phone normalizer — separate from `format-customer-phone.ts`, which is
 * display-only and must stay unchanged.
 *
 * `wa.me` needs digits only, country code included, no `+`, no spaces, no dashes.
 *
 * The governing rule is **never overcorrect**. `Customer.phone` is free text, so
 * anything this function cannot read confidently is rejected outright: the UI
 * then disables Open WhatsApp and leaves Copy message as the escape hatch. A
 * wrong-number send is the top privacy risk in this feature, and a guess that
 * looks plausible is worse than a refusal.
 */

const LEBANESE_MOBILE_PREFIXES = ['03', '70', '71', '76', '78', '79', '81'];

/** Digits, `+`, and the punctuation people actually type into a phone field. */
const ALLOWED_CHARACTERS = /^[0-9+\-() .\\/,;،]+$/;

/** Two separate 7+ digit runs is two phone numbers, not one. */
const LONG_DIGIT_RUN = /\d{7,}/g;

const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

function isLebaneseMobile(local: string): boolean {
  return local.length === 8 && LEBANESE_MOBILE_PREFIXES.includes(local.slice(0, 2));
}

function accept(digits: string, confidence: 'high' | 'low'): NormalizedWhatsAppPhone {
  return { ok: true, digits, display: formatWhatsAppDisplay(digits), confidence };
}

function reject(reason: Exclude<NormalizedWhatsAppPhone, { ok: true }>['reason']): NormalizedWhatsAppPhone {
  return { ok: false, reason };
}

/** Human-readable form shown to the employee before Open WhatsApp is enabled. */
export function formatWhatsAppDisplay(digits: string): string {
  if (digits.startsWith('961') && digits.length === 11) {
    const local = digits.slice(3);
    return `+961 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }
  return `+${digits}`;
}

export function normalizeWhatsAppPhone(raw: string | null | undefined): NormalizedWhatsAppPhone {
  const input = (raw ?? '').trim();
  if (input === '') return reject('EMPTY');

  // Letters, "ext", or any other stray character means we cannot read this
  // field with confidence.
  if (!ALLOWED_CHARACTERS.test(input)) return reject('UNPARSEABLE');

  // "70123456 / 03987654" is common in free-text phone fields. Mangling it into
  // one number would send a private balance to whichever half won.
  if ((input.match(LONG_DIGIT_RUN) ?? []).length > 1) return reject('MULTIPLE_NUMBERS');

  let digits = input.replace(/\D/g, '');
  if (digits === '') return reject('UNPARSEABLE');

  // `00` is the international access prefix; drop it and treat what follows as
  // a country code.
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('961')) {
    let local = digits.slice(3);
    if (local.length === 9 && local.startsWith('0')) local = local.slice(1);
    // An explicit Lebanese country code is a deliberate statement, so an 8-digit
    // local part is trusted even when the prefix is not a known mobile one.
    return local.length === 8 ? accept(`961${local}`, 'high') : reject('UNPARSEABLE');
  }

  if (digits.length === 9 && digits.startsWith('0')) {
    const local = digits.slice(1);
    return isLebaneseMobile(local) ? accept(`961${local}`, 'high') : reject('UNPARSEABLE');
  }

  if (digits.length === MIN_DIGITS) {
    return isLebaneseMobile(digits) ? accept(`961${digits}`, 'high') : reject('UNPARSEABLE');
  }

  if (digits.length < MIN_DIGITS) return reject('TOO_SHORT');
  if (digits.length > MAX_DIGITS) return reject('TOO_LONG');

  // 10–15 digits with some other country code: pass through untouched, but flag
  // it so the UI can say "assumed international" and keep the employee's eyes on
  // the number.
  if (digits.length >= 10) return accept(digits, 'low');

  return reject('UNPARSEABLE');
}
