import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface UpdateBusyProviderProps {
  children: ReactNode;
}

interface BusyContextValue {
  acquire: (key: string, reason: string) => void;
  release: (key: string) => void;
  reasons: string[];
}

const BusyContext = createContext<BusyContextValue>({
  acquire: () => undefined,
  release: () => undefined,
  reasons: [],
});

export function UpdateBusyProvider({ children }: UpdateBusyProviderProps) {
  // Immutable-map in state (not a ref) so React 19's rule against reading
  // refs during render stays happy — the Map identity changes on every
  // acquire/release, which drives both reactivity and the derived reasons.
  const [locks, setLocks] = useState<Map<string, string>>(() => new Map());

  const acquire = useCallback((key: string, reason: string) => {
    setLocks((current) => {
      if (current.get(key) === reason) return current;
      const next = new Map(current);
      next.set(key, reason);
      return next;
    });
  }, []);
  const release = useCallback((key: string) => {
    setLocks((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);
  const value = useMemo(() => ({
    acquire,
    release,
    reasons: [...locks.values()].sort(),
  }), [acquire, release, locks]);

  return <BusyContext.Provider value={value}>{children}</BusyContext.Provider>;
}

export function useBusyLock(key: string, active: boolean, reason: string): void {
  const { acquire, release } = useContext(BusyContext);
  useEffect(() => {
    if (!active) return;
    acquire(key, reason);
    return () => release(key);
  }, [key, active, reason, acquire, release]);
}

export function useBusyReasons(): string[] {
  return useContext(BusyContext).reasons;
}
