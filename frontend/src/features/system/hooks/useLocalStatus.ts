import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { systemApi } from '../api/system.api';
import { DatabaseSignal, LanScannerMode, LocalStatus } from '../types/system.types';
import { resolveDatabaseSignal, resolvePollInterval, shouldShowDisconnected, WindowActivity } from '../utils/status-polling';

export const systemKeys = {
  all: ['system'] as const,
  localStatus: () => [...systemKeys.all, 'local-status'] as const,
};

/**
 * Whether the browser tab is in front, behind, or hidden. Polling a local
 * backend is cheap but not free, and a minimised app has no one reading the
 * chips.
 */
export function useWindowActivity(): WindowActivity {
  const [activity, setActivity] = useState<WindowActivity>('focused');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => {
      if (document.visibilityState === 'hidden') setActivity('hidden');
      else setActivity(document.hasFocus() ? 'focused' : 'blurred');
    };
    update();
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  }, []);

  return activity;
}

/**
 * Internet reachability, for information only.
 *
 * HomeConnect runs entirely on the business PC, so this must never gate a
 * control or block a request — losing the internet changes nothing about what
 * the app can do.
 */
export function useInternetStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

export interface LocalStatusView {
  backendConnected: boolean;
  database: DatabaseSignal;
  lanScanner: LanScannerMode | null;
  internetOnline: boolean;
  status: LocalStatus | undefined;
}

export function useLocalStatus(): LocalStatusView {
  const activity = useWindowActivity();
  const internetOnline = useInternetStatus();
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

  const query = useQuery({
    queryKey: systemKeys.localStatus(),
    queryFn: () => systemApi.localStatus(),
    refetchInterval: resolvePollInterval(activity),
    refetchOnWindowFocus: true,
    // Failures are counted here rather than retried, so the chip reflects the
    // real number of consecutive misses instead of TanStack's retry attempts.
    retry: false,
    gcTime: 60_000,
  });

  useEffect(() => {
    if (query.isSuccess) setConsecutiveFailures(0);
  }, [query.isSuccess, query.dataUpdatedAt]);

  useEffect(() => {
    if (query.isError) setConsecutiveFailures((count) => count + 1);
  }, [query.isError, query.errorUpdatedAt]);

  const backendConnected = !shouldShowDisconnected(consecutiveFailures);

  return {
    backendConnected,
    database: resolveDatabaseSignal(query.data, backendConnected),
    lanScanner: backendConnected ? query.data?.lanScanner.mode ?? null : null,
    internetOnline,
    status: query.data,
  };
}
