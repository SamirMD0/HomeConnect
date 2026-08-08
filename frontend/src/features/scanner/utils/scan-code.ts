/**
 * Browser-side mirror of `backend/src/lib/scan-code.ts`.
 *
 * It exists so the scan box can tell a scannable code from ordinary typed text
 * before any request is made — the backend still normalizes every code it
 * receives and remains the authority.
 *
 * The two copies must agree. They are not imported from one another because the
 * frontend has never bundled backend source, and the alias that would allow it
 * is not wired into the test runner. `scan-code.parity.test.ts` imports both
 * implementations and fails if their answers ever diverge, so the duplication
 * cannot rot silently.
 */

export const SCAN_CODE_MIN_LENGTH = 4;
export const SCAN_CODE_MAX_LENGTH = 64;

const SCAN_CODE_PATTERN = /^[A-Za-z0-9-]+$/;
// eslint-disable-next-line no-control-regex
const STRIPPED_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g;
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
