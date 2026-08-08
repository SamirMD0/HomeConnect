import { RecentScan, ScannerEventRecord } from '../types/scanner.types';

/**
 * Fast enough that a scan on the shelf feels immediate at the counter, slow
 * enough that it is a rounding error against a local backend.
 */
export const PHONE_EVENT_POLL_MS = 1500;

/**
 * Events the PC has not seen yet, oldest first.
 *
 * Phone-sourced only: a scan made at the desk was already handled locally by
 * the scan box, so replaying it from the server would open the same drawer
 * twice.
 */
export function selectNewPhoneEvents(events: ScannerEventRecord[], cursor: number): ScannerEventRecord[] {
  return events
    .filter((event) => event.id > cursor && event.source === 'PHONE_SCANNER')
    .sort((a, b) => a.id - b.id);
}

/**
 * The cursor always advances to the newest id the server reported, not merely
 * the newest phone event. Otherwise a run of desk scans would be re-fetched on
 * every poll, growing the response until the ring buffer rolled over.
 */
export function nextCursor(current: number, latestEventId: number): number {
  return Math.max(current, latestEventId);
}

/**
 * Which scan should open a product, if any.
 *
 * The most recent match wins: if two arrive in one poll the employee is holding
 * the second one. Anything not found, unreadable, or missing a product id opens
 * nothing.
 */
export function pickAutoOpenEvent(events: ScannerEventRecord[]): ScannerEventRecord | null {
  const openable = events.filter((event) => event.status === 'FOUND' && event.productId);
  return openable.length ? openable[openable.length - 1] : null;
}

export function toRecentScanFromEvent(event: ScannerEventRecord): RecentScan {
  return {
    id: `event-${event.id}`,
    code: event.code,
    status: event.status,
    source: event.source,
    productId: event.productId,
    // The event carries no product name; the drawer that opens supplies it.
    productName: null,
    scannedAt: event.createdAt,
  };
}
