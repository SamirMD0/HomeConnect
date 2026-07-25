import { app, BrowserWindow, dialog, ipcMain, shell, clipboard } from 'electron';
import { ChildProcess } from 'child_process';
import { Server } from 'http';
import path from 'path';
import fs from 'fs';
import { startCompiledBackend } from './backend-process';
import { BACKEND_HEALTH_URL, FRONTEND_ORIGIN, READY_TIMEOUT_MS } from './runtime-config';
import { startStaticFrontendServer } from './static-frontend-server';
import { waitForUrl } from './readiness';
import { createWindow } from './window';
import { closeServerWithTimeout, focusExistingWindow, startupErrorMessage, stopChildProcessWithTimeout, shouldQuitAfterChildExit } from './lifecycle';
import { writeStartupDiagnostics } from './startup-diagnostics';
import { BACKEND_PORT, FRONTEND_PORT } from './runtime-config';

let backendProcess: ChildProcess | null = null;
let frontendServer: Server | null = null;
let isQuitting = false;

app.commandLine.appendSwitch('disable-crash-reporter');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    focusExistingWindow(BrowserWindow.getAllWindows());
  });

  app.whenReady().then(async () => {
    ipcMain.handle('ping', () => 'pong');

    ipcMain.handle('diagnostics:openLogsFolder', async () => {
      const safeUserDataPath = app.getPath('userData') || process.env.HOME_CONNECT_USER_DATA || '';
      const logsPath = path.join(safeUserDataPath, 'logs');
      if (fs.existsSync(logsPath)) {
        await shell.openPath(logsPath);
      }
    });

    ipcMain.handle('diagnostics:copyDiagnostics', (_event, data: string) => {
      clipboard.writeText(data);
    });

    try {
      if (process.env.NODE_ENV === 'development') {
        createWindow();
      } else {
        await startProductionRuntime();
        if (process.env.ELECTRON_PRODUCTION_CHECK_ONLY === '1') {
          await cleanupRuntime();
          app.quit();
          return;
        }
        await recordDiagnostic(true);
        createWindow(FRONTEND_ORIGIN);
      }
    } catch (error) {
      await recordDiagnostic(false, String(error));
      const message = startupErrorMessage(error);
      console.error(message);
      dialog.showErrorBox('HomeConnect failed to start', message);
      await cleanupRuntime();
      app.quit();
      return;
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(process.env.NODE_ENV === 'development' ? undefined : FRONTEND_ORIGIN);
      }
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    void cleanupRuntime();
  });
}

async function startProductionRuntime() {
  const appRoot = app.getAppPath();
  const backendRoot = app.isPackaged
    ? process.resourcesPath
    : appRoot;
  const backendEntryPath = path.join(backendRoot, 'dist/server/backend/src/index.js');
  const frontendDistPath = app.isPackaged
    ? path.join(process.resourcesPath, 'frontend/dist')
    : path.join(appRoot, 'frontend/dist');

  backendProcess = startCompiledBackend(backendEntryPath, app.getPath('userData'), process.resourcesPath);
  backendProcess.once('exit', (code) => {
    backendProcess = null;
    if (shouldQuitAfterChildExit(isQuitting)) {
      const message = `Backend exited unexpectedly with code ${code ?? 'unknown'}`;
      console.error(message);
      dialog.showErrorBox('HomeConnect backend stopped', message);
      app.quit();
    }
  });

  frontendServer = await startStaticFrontendServer(frontendDistPath);

  let backendReady = false;
  let frontendReady = false;
  
  await Promise.all([
    waitForUrl(BACKEND_HEALTH_URL, READY_TIMEOUT_MS, 'Compiled Express backend').then(() => { backendReady = true; }),
    waitForUrl(FRONTEND_ORIGIN, READY_TIMEOUT_MS, 'Static React frontend').then(() => { frontendReady = true; }),
  ]);
  
  return { backendReady, frontendReady };
}

async function recordDiagnostic(success: boolean, errorMsg?: string) {
  const appRoot = app.getAppPath();
  const backendRoot = app.isPackaged ? process.resourcesPath : appRoot;
  const safeUserDataPath = app.getPath('userData') || process.env.HOME_CONNECT_USER_DATA || '';
  const envFilePath = process.env.BACKEND_ENV_FILE || path.join(safeUserDataPath, 'config', 'production.env');

  let backendReady = false;
  let frontendReady = false;
  
  // If success is true, we know they are ready. If false, we just guess false for now 
  // since startProductionRuntime threw before setting global flags or we can just pass what we know.
  // Actually, we'll let the network check handle port status.
  if (success) {
    backendReady = true;
    frontendReady = true;
  }

  await writeStartupDiagnostics(safeUserDataPath, {
    envFilePath,
    backendReady,
    frontendReady,
    backendPort: BACKEND_PORT,
    frontendPort: FRONTEND_PORT,
    backendPath: path.join(backendRoot, 'dist/server/backend/src/index.js'),
    frontendPath: app.isPackaged ? path.join(process.resourcesPath, 'frontend/dist') : path.join(appRoot, 'frontend/dist'),
    prismaRuntimePath: app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.prisma') : path.join(appRoot, 'node_modules', '.prisma'),
    success,
    error: errorMsg,
  });
}

async function cleanupRuntime() {
  isQuitting = true;

  if (frontendServer) {
    await closeServerWithTimeout(frontendServer);
    frontendServer = null;
  }

  if (backendProcess) await stopChildProcessWithTimeout(backendProcess);
  backendProcess = null;
}
