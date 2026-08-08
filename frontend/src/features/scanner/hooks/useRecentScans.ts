import { useCallback, useState } from 'react';
import { RecentScan } from '../types/scanner.types';
import { appendRecentScan } from '../utils/scan-intent';

/**
 * The one recent-scans list, fed by both the desk scanner and any paired phone.
 *
 * Lifted out of `useScannerLookup` so the two sources cannot end up with
 * separate histories that disagree about what was scanned and when.
 *
 * Session state on purpose: it is a counter convenience, not an audit trail,
 * and the server keeps its own capped history.
 */
export function useRecentScans() {
  const [scans, setScans] = useState<RecentScan[]>([]);

  // `appendRecentScan` owns the ordering, the cap, and the duplicate guard.
  const add = useCallback((scan: RecentScan) => setScans((current) => appendRecentScan(current, scan)), []);

  const clear = useCallback(() => setScans([]), []);

  return { scans, add, clear };
}
