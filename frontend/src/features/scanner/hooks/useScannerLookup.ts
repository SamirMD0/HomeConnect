import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { scannerApi } from '../api/scanner.api';
import { RecentScan, ScanLookupResult } from '../types/scanner.types';
import { resolveScanIntent, toRecentScan } from '../utils/scan-intent';

interface UseScannerLookupOptions {
  /** Called once a scan resolves to a real product, to open or select it. */
  onFound?: (result: ScanLookupResult) => void;
  /** Called when the submitted text is not a code, so the caller can search instead. */
  onSearch?: (term: string) => void;
  /** Every resolved desk scan, for the shared recent-scans list. */
  onScanRecorded?: (scan: RecentScan) => void;
}

/**
 * One scan submission, end to end: decide what the text is, look it up, record
 * it, and hand a found product back to the caller.
 *
 * A mutation rather than a query — a scan is an event, and scanning the same
 * code twice must hit the server twice rather than replay a cached answer.
 */
export function useScannerLookup({ onFound, onSearch, onScanRecorded }: UseScannerLookupOptions = {}) {
  const [result, setResult] = useState<ScanLookupResult | null>(null);

  const mutation = useMutation({
    mutationFn: (code: string) => scannerApi.scan(code),
    onSuccess: (lookup, code) => {
      setResult(lookup);
      onScanRecorded?.(toRecentScan(lookup, code, 'PC_SCANNER'));
      if (lookup.status === 'FOUND') onFound?.(lookup);
    },
  });

  const submit = useCallback((raw: string) => {
    const intent = resolveScanIntent(raw);
    if (intent.kind === 'IGNORE') return intent;
    if (intent.kind === 'SEARCH') {
      setResult(null);
      onSearch?.(intent.term);
      return intent;
    }
    mutation.mutate(intent.code);
    return intent;
  }, [mutation, onSearch]);

  const clear = useCallback(() => setResult(null), []);

  return {
    submit,
    clear,
    result,
    isLooking: mutation.isPending,
    isError: mutation.isError,
  };
}
