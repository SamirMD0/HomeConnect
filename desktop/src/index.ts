import { app, BrowserWindow, dialog, ipcMain, session, shell, clipboard } from 'electron';
import { ChildProcess } from 'child_process';
import { Server } from 'http';
import path from 'path';
import fs from 'fs';
import { startCompiledBackend } from './backend-process';
import { applyContentSecurityPolicy, resolveCspMode } from './content-security-policy';
import { BACKEND_HEALTH_URL, FRONTEND_ORIGIN, READY_TIMEOUT_MS } from './runtime-config';
import { startStaticFrontendServer } from './static-frontend-server';
import { waitForUrl } from './readiness';
import { createWindow, createStartupMonitorWindow, DEFAULT_DEV_SERVER_URL } from './window';
import { focusExistingWindow, startupErrorMessage, shouldQuitAfterChildExit, cleanupRuntime as performCleanup } from './lifecycle';
import { writeStartupDiagnostics } from './startup-diagnostics';
import { BACKEND_PORT, FRONTEND_PORT } from './runtime-config';

let backendProcess: ChildProcess | null = null;
let frontendServer: Server | null = null;
let isQuitting = false;
let isRetrying = false;

app.commandLine.appendSwitch('disable-crash-reporter');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    focusExistingWindow(BrowserWindow.getAllWindows());
  });

  app.whenReady().then(async () => {
    // Registered before any window loads so the first response already carries it.
    applyContentSecurityPolicy(session.defaultSession, resolveCspMode());

    ipcMain.handle('ping', () => 'pong');

    ipcMain.handle('backup:selectDirectory', async () => {
      const result = await dialog.showOpenDialog({
        title: 'Select HomeConnect backup folder',
        properties: ['openDirectory', 'createDirectory'],
      });

      return result.canceled ? null : result.filePaths[0] ?? null;
    });

    ipcMain.handle('backup:selectFile', async () => {
      const result = await dialog.showOpenDialog({
        title: 'Select HomeConnect backup file',
        properties: ['openFile'],
        filters: [{ name: 'HomeConnect backups', extensions: ['backup'] }],
      });

      return result.canceled ? null : result.filePaths[0] ?? null;
    });

    ipcMain.handle('backup:openDirectory', async (_event, directory: string) => {
      if (!directory || typeof directory !== 'string') return '';
      return shell.openPath(directory);
    });

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

    ipcMain.handle('diagnostics:closeApp', () => {
      app.quit();
    });

    ipcMain.handle('diagnostics:retryStartup', async () => {
      isRetrying = true;
      await performCleanup(frontendServer, backendProcess);
      frontendServer = null;
      backendProcess = null;
      await bootApp();
    });

    let monitorWindow: BrowserWindow | null = null;

    const bootApp = async () => {
      isRetrying = false;
      if (!monitorWindow || monitorWindow.isDestroyed()) {
        monitorWindow = createStartupMonitorWindow();
      }

      const isDev = process.env.NODE_ENV === 'development';
      monitorWindow.webContents.on('did-finish-load', () => {
         monitorWindow?.webContents.send('diagnostics:startupState', { devMode: isDev });
      });

      const sendLog = (msg: string) => monitorWindow?.webContents.send('diagnostics:startupLog', msg);
      const updateStep = (step: string, status: 'active' | 'success' | 'error', errorMsg?: string) => {
        monitorWindow?.webContents.send('diagnostics:startupState', { step, status, error: errorMsg });
      };

      try {
        // Wait for preload script to be ready
        await new Promise(r => setTimeout(r, 500));

        updateStep('step-config', 'active');
        sendLog('Checking configuration...');
        await new Promise(r => setTimeout(r, 100)); // UI tick
        updateStep('step-config', 'success');

        if (isDev) {
          updateStep('step-backend', 'active');
          sendLog('Waiting for development backend...');
          await waitForUrl(BACKEND_HEALTH_URL, READY_TIMEOUT_MS, 'Development Express backend');
          updateStep('step-backend', 'success');

          updateStep('step-db', 'active');
          sendLog('Database verified via dev backend.');
          updateStep('step-db', 'success');

          updateStep('step-frontend', 'active');
          sendLog('Waiting for development frontend...');
          await waitForUrl(process.env.VITE_DEV_SERVER_URL || DEFAULT_DEV_SERVER_URL, READY_TIMEOUT_MS, 'Vite frontend');
          updateStep('step-frontend', 'success');

          sendLog('Startup complete. Opening app...');
          await new Promise(r => setTimeout(r, 500));
          if (monitorWindow && !monitorWindow.isDestroyed()) {
             monitorWindow.close();
             monitorWindow = null;
          }
          createWindow();
        } else {
          const appRoot = app.getAppPath();
          const backendRoot = app.isPackaged ? process.resourcesPath : appRoot;
          const backendEntryPath = path.join(backendRoot, 'dist/server/backend/src/index.js');
          const frontendDistPath = app.isPackaged ? path.join(process.resourcesPath, 'frontend/dist') : path.join(appRoot, 'frontend/dist');

          updateStep('step-backend', 'active');
          sendLog('Starting compiled backend process...');
          backendProcess = startCompiledBackend(backendEntryPath, app.getPath('userData'), process.resourcesPath, sendLog);

          backendProcess.once('exit', (code) => {
            if (!isRetrying && shouldQuitAfterChildExit(isQuitting)) {
              dialog.showErrorBox('HomeConnect backend stopped', `Backend exited unexpectedly with code ${code ?? 'unknown'}`);
              app.quit();
            }
          });

          await waitForUrl(BACKEND_HEALTH_URL, READY_TIMEOUT_MS, 'Compiled Express backend');
          updateStep('step-backend', 'success');

          updateStep('step-db', 'active');
          sendLog('Database verified via compiled backend.');
          updateStep('step-db', 'success');

          updateStep('step-frontend', 'active');
          sendLog('Starting static React frontend...');
          frontendServer = await startStaticFrontendServer(frontendDistPath);
          await waitForUrl(FRONTEND_ORIGIN, READY_TIMEOUT_MS, 'Static React frontend');
          updateStep('step-frontend', 'success');

          if (process.env.ELECTRON_PRODUCTION_CHECK_ONLY === '1') {
            await cleanupRuntime();
            app.quit();
            return;
          }

          await recordDiagnostic(true);
          sendLog('Startup complete. Opening app...');
          await new Promise(r => setTimeout(r, 500));
          if (monitorWindow && !monitorWindow.isDestroyed()) {
             monitorWindow.close();
             monitorWindow = null;
          }
          createWindow(FRONTEND_ORIGIN);
        }
      } catch (error) {
        const errorMsg = startupErrorMessage(error);
        sendLog(`[ERROR] ${errorMsg}`);

        if (errorMsg.includes('frontend')) {
          updateStep('step-frontend', 'error', errorMsg);
        } else if (errorMsg.includes('backend') || errorMsg.includes('DATABASE_UNAVAILABLE') || errorMsg.includes('fast-failed')) {
          if (errorMsg.includes('DATABASE_UNAVAILABLE') || errorMsg.includes('fast-failed')) {
             updateStep('step-db', 'error', errorMsg);
          } else {
             updateStep('step-backend', 'error', errorMsg);
          }
        } else {
          updateStep('step-config', 'error', errorMsg);
        }

        await recordDiagnostic(false, errorMsg);

        if (!monitorWindow || monitorWindow.isDestroyed()) {
          dialog.showErrorBox('HomeConnect failed to start', errorMsg);
          await cleanupRuntime();
          app.quit();
        }
      }
    };

    bootApp();

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

async function recordDiagnostic(success: boolean, errorMsg?: string) {
  const appRoot = app.getAppPath();
  const backendRoot = app.isPackaged ? process.resourcesPath : appRoot;
  const safeUserDataPath = app.getPath('userData') || process.env.HOME_CONNECT_USER_DATA || '';
  const envFilePath = process.env.BACKEND_ENV_FILE || path.join(safeUserDataPath, 'config', 'production.env');

  await writeStartupDiagnostics(safeUserDataPath, {
    envFilePath,
    backendReady: success,
    frontendReady: success,
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
  await performCleanup(frontendServer, backendProcess);
  frontendServer = null;
  backendProcess = null;
}
