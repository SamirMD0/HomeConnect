import { useEffect, useState } from 'react';

/** Default pause before a search term is sent to the server. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * Search inputs stay fully responsive — the text updates on every keystroke —
 * while the query behind them fires once the user pauses, instead of once per
 * character.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === debounced) return undefined;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, debounced]);

  return debounced;
}
