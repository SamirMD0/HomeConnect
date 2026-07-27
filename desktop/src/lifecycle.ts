import { Server } from 'http';

export const CLEANUP_TIMEOUT_MS = 5_000;

export interface FocusableWindow {
  isMinimized: () => boolean;
  restore: () => void;
  focus: () => void;
}

export function focusExistingWindow(windows: FocusableWindow[]) {
  const mainWindow = windows[0];
  if (!mainWindow) return false;

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  return true;
}

export function closeServerWithTimeout(server: Server, timeoutMs = CLEANUP_TIMEOUT_MS) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve();
    }, timeoutMs);

    server.close(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    });
  });
}

export function stopChildProcessWithTimeout(
  child: {
    exitCode: number | null;
    kill: (signal?: NodeJS.Signals | number) => boolean;
    once: (event: 'exit', listener: () => void) => unknown;
  },
  timeoutMs = CLEANUP_TIMEOUT_MS
) {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill('SIGKILL');
      settled = true;
      resolve();
    }, timeoutMs);

    child.once('exit', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

export async function cleanupRuntime(
  frontendServer: Server | null,
  backendProcess: {
    exitCode: number | null;
    kill: (signal?: NodeJS.Signals | number) => boolean;
    once: (event: 'exit', listener: () => void) => unknown;
  } | null
) {
  if (frontendServer) {
    await closeServerWithTimeout(frontendServer);
  }

  if (backendProcess) {
    await stopChildProcessWithTimeout(backendProcess);
  }
}

export function startupErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Electron startup failed';
}

export function shouldQuitAfterChildExit(isQuitting: boolean) {
  return !isQuitting;
}
