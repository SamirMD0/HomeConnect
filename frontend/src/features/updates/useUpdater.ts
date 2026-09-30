import { useCallback, useEffect, useState } from 'react';
import type { UpdaterStatus } from '../../types/updater';

export interface UseUpdater {
  status: UpdaterStatus;
  supported: boolean;
  checkNow: () => Promise<void>;
  installNow: () => Promise<void>;
}

export function useUpdater(): UseUpdater {
  const [status, setStatus] = useState<UpdaterStatus>({ state: 'idle' });
  const supported = typeof window !== 'undefined' && Boolean(window.electronAPI?.updater);

  useEffect(() => {
    const updater = window.electronAPI?.updater;
    if (!updater) return;

    let active = true;
    let receivedPush = false;
    const unsubscribe = updater.subscribe((next) => {
      receivedPush = true;
      if (active) setStatus(next);
    });
    void updater.currentStatus()
      .then((current) => {
        if (active && !receivedPush) setStatus(current);
      })
      .catch(() => {
        if (active && !receivedPush) setStatus({ state: 'error', error: 'check-failed' });
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const checkNow = useCallback(async () => {
    try {
      const next = await window.electronAPI?.updater?.checkNow();
      if (next) setStatus(next);
    } catch {
      setStatus({ state: 'error', error: 'check-failed' });
    }
  }, []);

  const installNow = useCallback(async () => {
    try {
      await window.electronAPI?.updater?.installNow();
    } catch {
      setStatus({ state: 'error', error: 'install-failed' });
    }
  }, []);

  return { status, supported, checkNow, installNow };
}
