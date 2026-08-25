import { WhatsAppUrlResult } from '../types/communication.types';
import { MAX_MESSAGE_LENGTH } from './message-templates';

/**
 * Builds the `wa.me` deep link. Nothing here sends anything — the employee still
 * presses Send inside WhatsApp.
 *
 * `https://wa.me/...` is preferred over `whatsapp://send?...`: on Windows it
 * resolves to WhatsApp Desktop when installed and falls back to the browser when
 * it is not, whereas a bare `whatsapp://` with no registered handler produces an
 * OS error dialog.
 */

export const WHATSAPP_URL_ORIGIN = 'https://wa.me';

/** Backstop only; the body cap in `MAX_MESSAGE_LENGTH` is the real guard. */
export const MAX_WHATSAPP_URL_LENGTH = 20000;

const VALID_DIGITS = /^\d{8,15}$/;

export function buildWhatsAppUrl(digits: string, body: string): WhatsAppUrlResult {
  if (!VALID_DIGITS.test(digits)) return { ok: false, reason: 'INVALID_PHONE' };

  const text = body.trim();
  if (text === '') return { ok: false, reason: 'EMPTY_MESSAGE' };
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'MESSAGE_TOO_LONG' };

  // encodeURIComponent handles Arabic and turns newlines into %0A.
  const url = `${WHATSAPP_URL_ORIGIN}/${digits}?text=${encodeURIComponent(text)}`;
  if (url.length > MAX_WHATSAPP_URL_LENGTH) return { ok: false, reason: 'URL_TOO_LONG' };

  return { ok: true, url };
}
