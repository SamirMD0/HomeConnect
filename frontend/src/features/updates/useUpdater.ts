import { useCallback, useEffect, useState } from 'react';
import type { UpdaterStatus } from '../../types/updater';
import { useBusyReasons } from './UpdateBusyContext';

export type InstallOutcome = { ok: true } | { ok: false; blocked: string[] };

export interface UseUpdater {
  status: UpdaterStatus;
  supported: boolean;
  busyReasons: string[];
  checkNow: () => Promise<void>;
  installNow: () => Promise<InstallOutcome>;
}

export function useUpdater(): UseUpdater {
  const [status, setStatus] = useState<UpdaterStatus>({ state: 'idle' });
  const supported = typeof window !== 'undefined' && Boolean(window.electronAPI?.updater);
  const busyReasons = useBusyReasons();

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

  const installNow = useCallback(async (): Promise<InstallOutcome> => {
    if (busyReasons.length > 0) return { ok: false, blocked: busyReasons };
    if (!window.electronAPI?.updater) return { ok: false, blocked: ['Updater not available'] };
    try {
      await window.electronAPI.updater.installNow();
      return { ok: true };
    } catch {
      return { ok: false, blocked: ['Could not start the installer'] };
    }
  }, [busyReasons]);

  return { status, supported, busyReasons, checkNow, installNow };
}
