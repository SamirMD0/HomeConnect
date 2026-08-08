import { normalizeScanCode } from './scan-code';
import { RecentScan, ScanLookupResult, ScanSource } from '../types/scanner.types';

/**
 * The scan box is also the product search box, so submitting it has to mean one
 * of two different things.
 *
 * A code that could exist as a barcode or SKU is treated as a scan and goes to
 * the exact-match lookup. Anything else — a model name, an Arabic word, three
 * digits — is ordinary text and goes to the existing search, which already does
 * trigram matching. Without this split, typing "fan" and pressing Enter would
 * report "product not found" while the list below showed fans.
 */
export type ScanIntent =
  | { kind: 'SCAN'; code: string }
  | { kind: 'SEARCH'; term: string }
  | { kind: 'IGNORE' };

export function resolveScanIntent(raw: string): ScanIntent {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'IGNORE' };

  const normalized = normalizeScanCode(raw);
  return normalized.ok ? { kind: 'SCAN', code: normalized.code } : { kind: 'SEARCH', term: trimmed };
}

export const RECENT_SCAN_LIMIT = 20;

/**
 * Newest first, capped, and never the same scan twice.
 *
 * The duplicate guard matters because phone scans arrive by polling: a response
 * redelivered after a hiccup must not add a second copy of a scan already
 * listed. Desk scans get a timestamped id and phone scans get the server's
 * event id, so both are stable enough to compare.
 */
export function appendRecentScan(scans: RecentScan[], scan: RecentScan, limit = RECENT_SCAN_LIMIT): RecentScan[] {
  if (scans.some((existing) => existing.id === scan.id)) return scans;
  return [scan, ...scans].slice(0, limit);
}

export function toRecentScan(
  result: ScanLookupResult,
  fallbackCode: string,
  source: ScanSource,
  now: Date = new Date()
): RecentScan {
  return {
    id: `${now.getTime()}-${fallbackCode}`,
    code: result.normalizedCode ?? fallbackCode,
    status: result.status,
    source,
    productId: result.product?.id ?? null,
    productName: result.product?.name ?? null,
    scannedAt: now.toISOString(),
  };
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Scanner mode keeps the caret in the scan box so a scan can never be typed
 * into whatever was last clicked.
 *
 * It stays out of the way of real editing: any other field, a modifier chord, or
 * an open dialog keeps the keystroke. Only a bare printable character pulls focus
 * back, which is exactly what the first character of a scan burst looks like.
 */
export function shouldRefocusScanInput(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  targetTagName?: string;
  targetIsContentEditable?: boolean;
}, dialogOpen = false): boolean {
  if (dialogOpen) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.targetIsContentEditable) return false;
  if (event.targetTagName && EDITABLE_TAGS.has(event.targetTagName.toUpperCase())) return false;
  // Printable single characters only: never Tab, Escape, F5, or an arrow key.
  return event.key.length === 1;
}
