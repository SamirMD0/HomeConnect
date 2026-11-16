/**
 * Normalization for scanned product codes, shared by every scan entry point:
 * the USB keyboard-wedge scanner on the PC today, and the phone scanner over
 * the LAN listener later.
 *
 * Keyboard-wedge scanners emit the code as keystrokes and append a terminator —
 * usually Enter, sometimes Tab — and can be configured with a whitespace
 * prefix. Normalization turns that raw burst into the exact string a product
 * row could hold, and rejects anything that could not be one.
 *
 * The accepted charset is the union of what the product validators allow to be
 * stored: barcode is `[A-Za-z0-9-]` (products.validator) and SKU is
 * `[A-Z0-9-]` (PRODUCT_SKU_PATTERN). A code outside that set cannot match any
 * row, so it is reported as invalid instead of being sent to the database.
 *
 * Two rules that must not be "improved" later:
 *   * Digits are never reinterpreted. Leading zeros are significant in EAN-13
 *     and UPC-A, so the code is never trimmed of them or coerced to a number.
 *   * Case is never folded. Lookup is case-insensitive at the query level, so
 *     the caller keeps the code exactly as it was scanned for display.
 */

export const SCAN_CODE_MIN_LENGTH = 4;
export const SCAN_CODE_MAX_LENGTH = 64;

/** Matches the storable charset. See the note above before widening this. */
const SCAN_CODE_PATTERN = /^[A-Za-z0-9-]+$/;

/**
 * C0/C1 controls — which covers the scanner's Enter (\r\n) and Tab terminators —
 * plus the zero-width characters and BOM that a phone keyboard or a misconfigured
 * scanner can inject between digits.
 */
// Matching control characters is the point of this pattern: they are exactly
// what the scanner terminator keystrokes arrive as.
// eslint-disable-next-line no-control-regex
const STRIPPED_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g;

/** Guards against pathological input before any per-character work is done. */
const MAX_RAW_LENGTH = 1024;

export type ScanCodeRejection = 'EMPTY' | 'TOO_SHORT' | 'TOO_LONG' | 'UNSUPPORTED_CHARACTERS';

export type ScanCodeResult =
  | { ok: true; code: string }
  | { ok: false; reason: ScanCodeRejection };

export function normalizeScanCode(raw: string): ScanCodeResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'EMPTY' };
  if (raw.length > MAX_RAW_LENGTH) return { ok: false, reason: 'TOO_LONG' };

  const code = raw.replace(STRIPPED_CHARACTERS, '').trim();

  if (code.length === 0) return { ok: false, reason: 'EMPTY' };
  if (code.length < SCAN_CODE_MIN_LENGTH) return { ok: false, reason: 'TOO_SHORT' };
  if (code.length > SCAN_CODE_MAX_LENGTH) return { ok: false, reason: 'TOO_LONG' };
  if (!SCAN_CODE_PATTERN.test(code)) return { ok: false, reason: 'UNSUPPORTED_CHARACTERS' };

  return { ok: true, code };
}
