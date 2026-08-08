import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scannerApi } from '../api/scanner.api';
import { ScannerEventRecord } from '../types/scanner.types';
import { nextCursor, PHONE_EVENT_POLL_MS, pickAutoOpenEvent, selectNewPhoneEvents } from '../utils/scan-events';

interface UseScannerEventsOptions {
  /** Polling is opt-in: only scanner mode turns it on. */
  enabled: boolean;
  /** Every new phone scan, oldest first, for the recent-scans list. */
  onPhoneScan?: (event: ScannerEventRecord) => void;
  /** The scan that should open a product, if the caller is free to act on it. */
  onOpenProduct?: (productId: string) => void;
  /** Suppresses opening while a dialog is up, without dropping the events. */
  canOpenProduct?: boolean;
}

/**
 * Brings scans made on a paired phone across to the PC.
 *
 * Polling rather than a socket: the two run in the same process on the same
 * machine, the delay is imperceptible at a counter, and it adds no reconnect
 * logic to a codebase that uses no WebSocket anywhere else.
 *
 * The cursor starts at whatever the server has already recorded, so opening the
 * page never replays this morning's scans or opens a drawer for one of them.
 */
export function useScannerEvents({ enabled, onPhoneScan, onOpenProduct, canOpenProduct = true }: UseScannerEventsOptions) {
  // Held in a ref, not state: advancing it must not itself trigger a re-render
  // or a refetch, or the poll would run away from its interval.
  const cursor = useRef<number | null>(null);
  // Mirrored into a ref so the polling effect can read the current value without
  // taking it as a dependency, which would re-run processing every time a dialog
  // opened or closed.
  const canOpen = useRef(canOpenProduct);
  useEffect(() => { canOpen.current = canOpenProduct; }, [canOpenProduct]);

  const query = useQuery({
    queryKey: ['scanner', 'events'],
    queryFn: () => scannerApi.recentEvents(cursor.current ?? 0),
    enabled,
    refetchInterval: PHONE_EVENT_POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
    gcTime: 0,
  });

  useEffect(() => {
    if (!enabled) { cursor.current = null; }
  }, [enabled]);

  useEffect(() => {
    if (!query.data) return;

    // First response only establishes where "new" begins.
    if (cursor.current === null) {
      cursor.current = query.data.latestEventId;
      return;
    }

    const fresh = selectNewPhoneEvents(query.data.events, cursor.current);
    cursor.current = nextCursor(cursor.current, query.data.latestEventId);
    if (!fresh.length) return;

    for (const event of fresh) onPhoneScan?.(event);

    const toOpen = pickAutoOpenEvent(fresh);
    if (toOpen?.productId && canOpen.current) onOpenProduct?.(toOpen.productId);
    // Reacting to each delivered response; the callbacks are intentionally not
    // dependencies, since they are redefined on every render of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, query.dataUpdatedAt, enabled]);

  return { isPolling: enabled && !query.isError, isError: query.isError };
}
