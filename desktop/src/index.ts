import { app, BrowserWindow, dialog, ipcMain, session, shell, clipboard } from 'electron';
import { ChildProcess } from 'child_process';
import { Server } from 'http';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { startCompiledBackend, redactLogChunk } from './backend-process';
import { applyContentSecurityPolicy, resolveCspMode } from './content-security-policy';
import { BACKEND_HEALTH_URL, FRONTEND_ORIGIN, READY_TIMEOUT_MS } from './runtime-config';
import { startStaticFrontendServer } from './static-frontend-server';
import { waitForUrl } from './readiness';
import { createWindow, createStartupMonitorWindow, DEFAULT_DEV_SERVER_URL } from './window';
import { focusExistingWindow, shouldQuitAfterChildExit, cleanupRuntime as performCleanup } from './lifecycle';
import { describeStartupFailure, startupFailureText } from './startup-failure-messages';
import { writeStartupDiagnostics, checkPortInUse } from './startup-diagnostics';
import { configuredDatabaseUrl, preflightDatabaseConnection } from './database-preflight';
import { createStartupTimeline } from './startup-timeline';
import { BACKEND_PORT, FRONTEND_PORT } from './runtime-config';
import { WHATSAPP_OPEN_CHANNEL, openWhatsAppUrl } from './whatsapp-link';
import { LABEL_PRINT_CHANNEL, printLabels } from './label-print';
import { runPreMigrationGuard, discoverPackagedPostgresTool } from './pre-migration-guard';
import { startUpdateChecker } from './updater';
import { prepareRollback, readRollback, updateRollback } from './update-rollback';
import { waitForRendererReady } from './renderer-readiness';

let backendProcess: ChildProcess | null = null;
let frontendServer: Server | null = null;
let isQuitting = false;
let isRetrying = false;
let isBooting = false;
let startupComplete = false;
let cleanupStarted = false;

if (process.env.HOME_CONNECT_USER_DATA) app.setPath('userData', path.resolve(process.env.HOME_CONNECT_USER_DATA));

app.commandLine.appendSwitch('disable-crash-reporter');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    focusExistingWindow(BrowserWindow.getAllWindows());
  });

  app.whenReady().then(async () => {
    if (app.isPackaged) await updateRollback(app.getPath('userData'), app.getVersion(), {
      status: 'starting', startupPid: process.pid, deadline: Date.now() + 600_000,
    });
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

    /**
     * Exports whatever the window is currently showing as a PDF.
     *
     * `printToPDF` runs the page through the same print stylesheet the printer
     * would use, so the PDF and the paper come out identical, and the CODE128
     * barcode stays vector — rasterising it (the html2canvas route) measurably
     * hurts scanning off a printed sheet.
     */
    ipcMain.handle('labels:exportPdf', async (event, options: { suggestedName?: string; paper?: string } = {}) => {
      const contents = event.sender;
      const paper = options.paper === 'LETTER' ? 'Letter' : 'A4';
      const suggestedName = typeof options.suggestedName === 'string' && options.suggestedName.trim()
        ? options.suggestedName.trim()
        : 'product-labels.pdf';

      const result = await dialog.showSaveDialog({
        title: 'Save product labels as PDF',
        defaultPath: suggestedName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      // Cancelling is an ordinary outcome, not an error.
      if (result.canceled || !result.filePath) return { saved: false };

      try {
        const pdf = await contents.printToPDF({
          pageSize: paper,
          printBackground: true,
          margins: { marginType: 'none' },
        });
        await fs.promises.writeFile(result.filePath, pdf);
        return { saved: true, path: result.filePath };
      } catch (error) {
        return { saved: false, error: error instanceof Error ? error.message : 'PDF export failed' };
      }
    });

    ipcMain.handle('documents:exportPdf', async (event, options: {
      suggestedName?: string;
      paper?: string;
      orientation?: string;
    } = {}) => {
      const paper = options.paper === 'LETTER' ? 'Letter' : 'A4';
      const landscape = options.orientation === 'landscape';
      const requestedName = typeof options.suggestedName === 'string' ? path.basename(options.suggestedName.trim()) : '';
      const suggestedName = requestedName && requestedName.toLowerCase().endsWith('.pdf')
        ? requestedName
        : 'document.pdf';
      const result = await dialog.showSaveDialog({
        title: 'Save document as PDF',
        defaultPath: suggestedName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (result.canceled || !result.filePath) return { saved: false };

      try {
        const pdf = await event.sender.printToPDF({
          pageSize: paper,
          landscape,
          preferCSSPageSize: true,
          printBackground: true,
          margins: { marginType: 'none' },
        });
        await fs.promises.writeFile(result.filePath, pdf);
        return { saved: true, path: result.filePath };
      } catch (error) {
        return { saved: false, error: error instanceof Error ? error.message : 'PDF export failed' };
      }
    });

    /** One label per page at its exact size; see label-print.ts for why not window.print(). */
    ipcMain.handle(LABEL_PRINT_CHANNEL, (event, request: unknown) => printLabels(event.sender, request));

    /**
     * Hands a customer-communication deep link to the OS. The URL is validated
     * in `whatsapp-link.ts` — https + `wa.me` only — before it reaches
     * `shell.openExternal`. HomeConnect does not send the message; WhatsApp
     * opens with the text prefilled and the employee presses Send.
     */
    ipcMain.handle(WHATSAPP_OPEN_CHANNEL, (_event, url: unknown) =>
      openWhatsAppUrl(url, (target) => shell.openExternal(target))
    );

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
      if (isBooting || isRetrying) return;
      isRetrying = true;
      await performCleanup(frontendServer, backendProcess);
      frontendServer = null;
      backendProcess = null;
      await bootApp();
    });

    let monitorWindow: BrowserWindow | null = null;

    const bootApp = async () => {
      if (isBooting) return;
      isBooting = true;
      startupComplete = false;
      isRetrying = false;
      if (!monitorWindow || monitorWindow.isDestroyed()) {
        monitorWindow = createStartupMonitorWindow();
      }

      const isDev = process.env.NODE_ENV === 'development';
      monitorWindow.webContents.once('did-finish-load', () => {
         monitorWindow?.webContents.send('diagnostics:startupState', { devMode: isDev });
      });

      const sendLog = createStartupTimeline(app.getPath('userData'), (msg) => {
        if (monitorWindow && !monitorWindow.isDestroyed()) monitorWindow.webContents.send('diagnostics:startupLog', msg);
      });
      sendLog(`Electron boot attempt started; mode=${isDev ? 'development' : 'production'}; packaged=${app.isPackaged}`);
      const updateStep = (step: string, status: 'active' | 'success' | 'error', errorMsg?: string) => {
        monitorWindow?.webContents.send('diagnostics:startupState', { step, status, error: errorMsg });
      };

      const recoverFailedUpdate = async (reason: string) => {
        if (!app.isPackaged) return false;
        const requested = await updateRollback(app.getPath('userData'), app.getVersion(), {
          status: 'rollback-requested', failure: redactLogChunk(reason),
        });
        if (!requested) return false;
        sendLog('Restoring the previous version. HomeConnect will reopen automatically.');
        isQuitting = true;
        await cleanupRuntime();
        app.quit();
        return true;
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
          // The supported dev launcher starts and awaits both services before
          // opening Electron. Direct `electron .` in development owns neither.
          if (!await checkPortInUse(BACKEND_PORT)) throw new Error('Development Express backend is not running. Start the app with npm run dev:electron.');
          await waitForUrl(BACKEND_HEALTH_URL, READY_TIMEOUT_MS, 'Development Express backend', {requireDatabase:true,onProbe:(ms,r)=>sendLog(`Backend probe: ${Math.round(ms)}ms, ${r.statusCode || 'not listening'}`)});
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
          const win = createWindow();
          await recordDiagnostic(true);
          try {
            startUpdateChecker(win, { logger: console });
          } catch {
            console.info('updater: init failed');
          }
          startupComplete = true;
          if (monitorWindow && !monitorWindow.isDestroyed()) {
             monitorWindow.close();
             monitorWindow = null;
          }
        } else {
          const appRoot = app.getAppPath();
          const backendRoot = app.isPackaged ? process.resourcesPath : appRoot;
          const backendEntryPath = path.join(backendRoot, 'dist/server/backend/src/index.js');
          const frontendDistPath = app.isPackaged ? path.join(process.resourcesPath, 'frontend/dist') : path.join(appRoot, 'frontend/dist');

          updateStep('step-backend', 'active');
          if (!fs.existsSync(backendEntryPath)) throw new Error('Compiled backend build missing. Run npm run build before launching.');
          if (await checkPortInUse(BACKEND_PORT)) throw new Error(`Backend port ${BACKEND_PORT} already in use. Close the other application before retrying.`);
          const envFilePath = process.env.BACKEND_ENV_FILE || path.join(app.getPath('userData'), 'config', 'production.env');
          const databaseUrl = configuredDatabaseUrl(envFilePath) || '';
          if (await preflightDatabaseConnection(databaseUrl) === 'refused') {
            throw new Error('DATABASE_UNAVAILABLE: the configured PostgreSQL endpoint refused a TCP connection.');
          }
          if (app.isPackaged) {
            let configuredBackupDir = '';
            try { configuredBackupDir = dotenv.parse(fs.readFileSync(envFilePath)).BACKUP_DIR || ''; } catch { /* Use the default backup directory. */ }
            updateStep('step-config', 'active');
            sendLog('Running pre-migration guard...');
            const guardOutcome = await runPreMigrationGuard({
              currentVersion: app.getVersion(),
              userDataDir: app.getPath('userData'),
              backupDir: process.env.BACKUP_DIR || configuredBackupDir || path.join(app.getPath('userData'), 'backups'),
              migrationsDir: path.join(process.resourcesPath, 'prisma', 'migrations'),
              databaseUrl,
              isPackaged: app.isPackaged,
              onMigrationStarting: async () => {
                await updateRollback(app.getPath('userData'), app.getVersion(), { databaseMayHaveChanged: true });
              },
              logger: { info: (message) => sendLog(redactLogChunk(message)), error: (message) => sendLog(`[ERROR] ${redactLogChunk(message)}`) },
            });
            if (guardOutcome.kind === 'failed') {
              if (await recoverFailedUpdate(`${guardOutcome.code}: ${guardOutcome.error}`)) return;
              monitorWindow?.webContents.send('diagnostics:startupState', {
                migrationFailed: {
                  code: guardOutcome.code,
                  backupPath: guardOutcome.backupPath ?? '',
                  from: guardOutcome.from,
                  to: guardOutcome.to,
                  error: guardOutcome.error,
                },
              });
              try { await recordDiagnostic(false, `pre-migration-guard: ${guardOutcome.code}: ${guardOutcome.error}`); }
              catch { sendLog('Could not write pre-migration diagnostics.'); }
              return;
            }
            if (guardOutcome.kind === 'migrated') sendLog(`Applied ${guardOutcome.count} migration(s). Backup at ${guardOutcome.backupPath}`);
            updateStep('step-config', 'success');
          }
          sendLog('Starting compiled backend process...');
          await updateRollback(app.getPath('userData'), app.getVersion(), { databaseMayHaveChanged: true });
          backendProcess = startCompiledBackend(backendEntryPath, app.getPath('userData'), process.resourcesPath, sendLog);
          const startupAbort = new AbortController();
          const ownedBackend = backendProcess;
          backendProcess.once('error', (error) => startupAbort.abort(new Error(`Backend process failed: ${redactLogChunk(error.message)}`)));

          backendProcess.once('exit', (code) => {
            sendLog(`Backend process exited: code=${code}`);
            startupAbort.abort(new Error(`Backend process exited with code ${code ?? 'unknown'}; see startup log for the preceding error.`));
            if (startupComplete && backendProcess === ownedBackend && !isRetrying && shouldQuitAfterChildExit(isQuitting)) {
              dialog.showErrorBox('HomeConnect backend stopped', `Backend exited unexpectedly with code ${code ?? 'unknown'}`);
              app.quit();
            }
          });

          sendLog(`Backend spawned pid=${backendProcess.pid}; waiting for database health`);
          await waitForUrl(BACKEND_HEALTH_URL, READY_TIMEOUT_MS, 'Compiled Express backend', {signal:startupAbort.signal,requireDatabase:true,onProbe:(ms,r)=>sendLog(`Backend probe: ${Math.round(ms)}ms, ${r.statusCode || 'not listening'}`)});
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

          sendLog('Startup complete. Opening app...');
          await new Promise(r => setTimeout(r, 500));
          const win = createWindow(FRONTEND_ORIGIN, true);
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Application window did not load')), READY_TIMEOUT_MS);
            win.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
            win.webContents.once('did-fail-load', () => { clearTimeout(timer); reject(new Error('Application window could not load')); });
          });
          await waitForRendererReady(win.webContents, READY_TIMEOUT_MS);
          await updateRollback(app.getPath('userData'), app.getVersion(), { status: 'committed' });
          await recordDiagnostic(true);
          win.show();
          try {
            const rollback = await readRollback(app.getPath('userData'));
            startUpdateChecker(win, {
              logger: console,
              rejectedVersion: rollback?.status === 'rolled-back' ? rollback.to : undefined,
              onInstallFailure: async (version) => {
                await updateRollback(app.getPath('userData'), version, { status: 'cancelled' });
                if (!backendProcess) {
                  backendProcess = startCompiledBackend(backendEntryPath, app.getPath('userData'), process.resourcesPath, sendLog);
                  await waitForUrl(BACKEND_HEALTH_URL, READY_TIMEOUT_MS, 'Previous version backend', { requireDatabase: true });
                }
                isRetrying = false;
              },
              beforeInstall: async (version) => {
                const tools = {
                  pgDumpPath: discoverPackagedPostgresTool('pg_dump'),
                  pgRestorePath: discoverPackagedPostgresTool('pg_restore'),
                  psqlPath: discoverPackagedPostgresTool('psql'),
                };
                if (!tools.pgDumpPath || !tools.pgRestorePath || !tools.psqlPath || !databaseUrl) {
                  throw new Error('Update recovery tools are missing');
                }
                // Quiesce owned services before the backup. The current app stays installed
                // and its backend is restarted if preparation cannot finish.
                isRetrying = true;
                await performCleanup(null, backendProcess);
                backendProcess = null;
                try {
                  await prepareRollback({
                    from: app.getVersion(), to: version, installDir: path.dirname(process.execPath),
                    userDataDir: app.getPath('userData'), envFilePath, databaseUrl,
                    pgDump: tools.pgDumpPath, pgRestore: tools.pgRestorePath, psql: tools.psqlPath,
                    receiptsDir: process.env.RECEIPTS_DIR || dotenv.parse(fs.readFileSync(envFilePath)).RECEIPTS_DIR
                      || path.join(app.getPath('userData'), 'receipts'),
                  });
                } catch (error) {
                  backendProcess = startCompiledBackend(backendEntryPath, app.getPath('userData'), process.resourcesPath, sendLog);
                  await waitForUrl(BACKEND_HEALTH_URL, READY_TIMEOUT_MS, 'Previous version backend', { requireDatabase: true });
                  isRetrying = false;
                  throw error;
                }
              },
            });
          } catch {
            console.info('updater: init failed');
          }
          startupComplete = true;
          if (monitorWindow && !monitorWindow.isDestroyed()) {
             monitorWindow.close();
             monitorWindow = null;
          }
        }
      } catch (error) {
        if (await recoverFailedUpdate(error instanceof Error ? error.message : 'Update startup failed')) return;
        // Raw text goes to the log for diagnostics; the operator sees the
        // plain-English summary and the fix (see startup-failure-messages.ts).
        const failure = describeStartupFailure(error);
        const errorMsg = startupFailureText(failure);
        sendLog(`[ERROR] ${redactLogChunk(failure.raw)}`);
        sendLog(`[WHAT TO DO] ${failure.fix}`);

        monitorWindow?.webContents.send('diagnostics:startupState', {
          step: failure.step,
          status: 'error',
          error: failure.summary,
          fix: failure.fix,
        });

        isRetrying = true;
        await performCleanup(frontendServer, backendProcess);
        frontendServer = null;
        backendProcess = null;
        isRetrying = false;
        sendLog('Failed attempt cleanup complete; owned services stopped.');
        await recordDiagnostic(false, redactLogChunk(`${failure.summary} (${failure.raw})`));

        if (!monitorWindow || monitorWindow.isDestroyed()) {
          dialog.showErrorBox('HomeConnect failed to start', errorMsg);
          await cleanupRuntime();
          app.quit();
        }
      } finally { isBooting = false; }
    };

    bootApp();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(process.env.NODE_ENV === 'development' ? undefined : FRONTEND_ORIGIN);
      }
    });
  });

  app.on('before-quit', (event) => {
    isQuitting = true;
    if (!cleanupStarted && (backendProcess || frontendServer)) {
      event.preventDefault();
      cleanupStarted = true;
      void cleanupRuntime().finally(() => app.quit());
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
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
