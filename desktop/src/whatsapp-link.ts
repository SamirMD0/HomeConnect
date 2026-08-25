/**
 * The only outbound-link path in the desktop shell.
 *
 * `setWindowOpenHandler` denies `window.open` and the CSP is `default-src 'self'`,
 * so the renderer genuinely cannot reach WhatsApp on its own — which is the point.
 * This channel opens exactly one shape of URL and nothing else.
 *
 * Validation happens **here, in the main process**. A renderer-side check would
 * be worthless, and an IPC channel that forwards arbitrary strings to
 * `shell.openExternal` is a real security hole: `file:`, `javascript:`, and
 * custom protocol handlers all become reachable. The allowlist is the feature.
 *
 * No shell command execution, no `exec`, no string interpolation into a command
 * line — `shell.openExternal` with a parsed-and-allowlisted https URL only.
 */

export const WHATSAPP_OPEN_CHANNEL = 'comm:openWhatsApp';

export const ALLOWED_WHATSAPP_PROTOCOL = 'https:';
export const ALLOWED_WHATSAPP_HOST = 'wa.me';

/** Matches the renderer's own cap; a longer string is not a link we sent. */
export const MAX_WHATSAPP_URL_LENGTH = 20000;

export interface OpenWhatsAppResult {
  opened: boolean;
  error?: string;
}

const BLOCKED_MESSAGE = 'Blocked: only https://wa.me links can be opened.';

export function isAllowedWhatsAppUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const candidate = value.trim();
  if (candidate === '' || candidate.length > MAX_WHATSAPP_URL_LENGTH) return false;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }

  // `hostname` is compared exactly, so `evil.wa.me`, `wa.me.evil.com` and
  // `https://wa.me@evil.com` (whose hostname is `evil.com`) are all rejected.
  return parsed.protocol === ALLOWED_WHATSAPP_PROTOCOL && parsed.hostname === ALLOWED_WHATSAPP_HOST;
}

/**
 * `openExternal` is injected so the allowlist can be tested without Electron —
 * and so a rejected input can be proven never to reach it.
 */
export async function openWhatsAppUrl(
  url: unknown,
  openExternal: (target: string) => Promise<void>
): Promise<OpenWhatsAppResult> {
  if (!isAllowedWhatsAppUrl(url)) return { opened: false, error: BLOCKED_MESSAGE };

  try {
    await openExternal(url.trim());
    return { opened: true };
  } catch (error) {
    return { opened: false, error: error instanceof Error ? error.message : 'Failed to open WhatsApp' };
  }
}
