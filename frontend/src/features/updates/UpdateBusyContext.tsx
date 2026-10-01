import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  const locks = useRef(new Map<string, string>());
  const [version, setVersion] = useState(0);

  const acquire = useCallback((key: string, reason: string) => {
    if (locks.current.get(key) === reason) return;
    locks.current.set(key, reason);
    setVersion((current) => current + 1);
  }, []);
  const release = useCallback((key: string) => {
    if (locks.current.delete(key)) setVersion((current) => current + 1);
  }, []);
  const value = useMemo(() => ({
    acquire,
    release,
    reasons: [...locks.current.values()].sort(),
  }), [acquire, release, version]);

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
