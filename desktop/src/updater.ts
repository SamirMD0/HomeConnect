import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { autoUpdater as defaultAutoUpdater } from 'electron-updater';
import type { AppUpdater, ProgressInfo, UpdateInfo } from 'electron-updater';

export type UpdaterState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdaterStatus {
  state: UpdaterState;
  version?: string;
  progressPct?: number;
  error?: string;
  lastCheckedAt?: string;
}

export interface StartUpdateCheckerOptions {
  autoUpdater?: AppUpdater;
  timers?: {
    setTimeout: typeof setTimeout;
    setInterval: typeof setInterval;
    clearTimeout: typeof clearTimeout;
    clearInterval: typeof clearInterval;
  };
  logger?: {
    info: (msg: string, ...meta: unknown[]) => void;
    error: (msg: string, ...meta: unknown[]) => void;
  };
  initialCheckDelayMs?: number;
  recurringCheckIntervalMs?: number;
  progressThrottleMs?: number;
}

export interface UpdaterHandle {
  checkNow(): Promise<void>;
  installNow(): void;
  currentStatus(): UpdaterStatus;
  stop(): void;
}

const noopHandle = (status: UpdaterStatus = { state: 'idle' }): UpdaterHandle => ({
  checkNow: () => Promise.resolve(),
  installNow: () => undefined,
  currentStatus: () => ({ ...status }),
  stop: () => undefined,
});

let activeHandle: UpdaterHandle | undefined;
let ipcHandlersRegistered = false;

function registerIpcHandlers() {
  if (ipcHandlersRegistered) return;
  ipcMain.handle('updater:checkNow', async () => {
    await activeHandle?.checkNow();
    return activeHandle?.currentStatus() ?? { state: 'idle' };
  });
  ipcMain.handle('updater:installNow', () => activeHandle?.installNow());
  ipcMain.handle('updater:currentStatus', () => activeHandle?.currentStatus() ?? { state: 'idle' });
  ipcHandlersRegistered = true;
}

export function startUpdateChecker(
  mainWindow: BrowserWindow,
  options: StartUpdateCheckerOptions = {},
): UpdaterHandle {
  const logger = options.logger ?? console;
  if (process.env.HOME_CONNECT_UPDATE_DISABLED === '1') {
    logger.info('updater: disabled');
    return noopHandle();
  }

  const updater = options.autoUpdater ?? defaultAutoUpdater;
  const timers = options.timers ?? { setTimeout, setInterval, clearTimeout, clearInterval };
  const initialDelay = options.initialCheckDelayMs ?? 60_000;
  const recurringInterval = options.recurringCheckIntervalMs ?? 6 * 60 * 60 * 1_000;
  const progressThrottle = options.progressThrottleMs ?? 1_000;
  let status: UpdaterStatus = { state: 'idle' };
  let inFlight: Promise<void> | undefined;
  let lastProgressEmittedAt: number | undefined;
  let initialTimer: ReturnType<typeof setTimeout>;
  let recurringTimer: ReturnType<typeof setInterval>;
  const listeners: Array<[string, (...args: any[]) => void]> = [];

  const publish = (next: UpdaterStatus, send = true) => {
    status = next;
    if (send && !mainWindow.isDestroyed()) mainWindow.webContents.send('updater:status', next);
  };
  const failEvent = (reason: string) => {
    logger.info(`updater: ${reason}`);
    status = { state: 'error', error: reason, lastCheckedAt: new Date().toISOString() };
  };
  const listen = (event: string, handler: (...args: any[]) => void) => {
    const guarded = (...args: any[]) => {
      try { handler(...args); } catch { failEvent('event-failed'); }
    };
    updater.on(event as any, guarded);
    listeners.push([event, guarded]);
  };

  const checkNow = (): Promise<void> => {
    if (inFlight) return inFlight;
    logger.info('updater: check started');
    inFlight = Promise.resolve()
      .then(() => updater.checkForUpdates())
      .then(() => undefined)
      .catch(() => {
        logger.info('updater: check-failed');
        publish({ state: 'error', error: 'check-failed', lastCheckedAt: new Date().toISOString() });
      })
      .finally(() => { inFlight = undefined; });
    return inFlight;
  };

  const handle: UpdaterHandle = {
    checkNow,
    installNow: () => {
      try {
        logger.info('updater: install-requested');
        updater.quitAndInstall(false, true);
      } catch {
        logger.info('updater: install-failed');
        publish({ state: 'error', error: 'install-failed' });
      }
    },
    currentStatus: () => ({ ...status }),
    stop: () => {
      timers.clearTimeout(initialTimer);
      timers.clearInterval(recurringTimer);
      for (const [event, listener] of listeners) updater.removeListener(event as any, listener);
    },
  };

  try {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    listen('checking-for-update', () => publish({ state: 'checking' }));
    listen('update-available', (info: UpdateInfo) => publish({ state: 'available', version: info.version }));
    listen('update-not-available', () => publish({ state: 'idle', lastCheckedAt: new Date().toISOString() }));
    listen('download-progress', (progress: ProgressInfo) => {
      const next = { state: 'downloading' as const, version: status.version, progressPct: progress.percent };
      const now = Date.now();
      if (lastProgressEmittedAt === undefined || now - lastProgressEmittedAt >= progressThrottle) {
        lastProgressEmittedAt = now;
        publish(next);
      } else publish(next, false);
    });
    listen('update-downloaded', (info: UpdateInfo) => publish({ state: 'ready', version: info.version }));
    listen('error', (error: Error) => {
      const reason = /sha-?512/i.test(error?.message ?? '') ? 'sha512-mismatch' : 'download-failed';
      (reason === 'sha512-mismatch' ? logger.error : logger.info)(`updater: ${reason}`);
      publish({ state: 'error', error: reason, lastCheckedAt: new Date().toISOString() });
    });
    activeHandle = handle;
    registerIpcHandlers();
    initialTimer = timers.setTimeout(() => void checkNow(), initialDelay);
    recurringTimer = timers.setInterval(() => void checkNow(), recurringInterval);
    return handle;
  } catch {
    logger.info('updater: init-failed');
    return noopHandle({ state: 'error', error: 'init-failed' });
  }
}
