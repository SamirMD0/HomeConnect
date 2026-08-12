export const MAX_SCAN_CODE_LENGTH = 64;

export type PreparedScanCode =
  | { ok: true; code: string }
  | { ok: false; message: string };

export function prepareScanCode(raw: string): PreparedScanCode {
  const code = raw.trim();
  if (!code) return { ok: false, message: 'Scan or enter a barcode or SKU.' };
  if (code.length > MAX_SCAN_CODE_LENGTH) {
    return { ok: false, message: `Codes may contain at most ${MAX_SCAN_CODE_LENGTH} characters.` };
  }
  return { ok: true, code };
}

export function eventPayload(code: string): { code: string } {
  return { code };
}
