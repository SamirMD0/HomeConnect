import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contextBridge, ipcRenderer } from 'electron';

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

describe('preload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes only allowed APIs to the renderer', async () => {
    // Dynamically import to trigger the top-level execution
    await import('./preload.js');

    const exposeMock = vi.mocked(contextBridge.exposeInMainWorld);
    expect(exposeMock).toHaveBeenCalledTimes(1);

    const [apiKey, apiObj] = exposeMock.mock.calls[0];
    
    expect(apiKey).toBe('electronAPI');
    
    // Check surface area
    const allowedMethods = [
      'ping', 'selectBackupDirectory', 'openBackupDirectory', 'selectBackupFile', 'openLogsFolder', 'copyDiagnostics',
      'retryStartup', 'closeApp', 'onStartupLog', 'onStartupState'
    ];
    const actualMethods = Object.keys(apiObj as object);
    
    expect(actualMethods.sort()).toEqual(allowedMethods.sort());

    // Verify copyDiagnostics invokes correct IPC channel
    const copyDiagnosticsFn = (apiObj as any).copyDiagnostics;
    expect(typeof copyDiagnosticsFn).toBe('function');
    
    copyDiagnosticsFn('test-data');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('diagnostics:copyDiagnostics', 'test-data');

    // Verify openLogsFolder invokes correct IPC channel
    const openLogsFolderFn = (apiObj as any).openLogsFolder;
    expect(typeof openLogsFolderFn).toBe('function');
    
    openLogsFolderFn();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('diagnostics:openLogsFolder');

    (apiObj as any).selectBackupDirectory();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('backup:selectDirectory');

    (apiObj as any).selectBackupFile();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('backup:selectFile');

    (apiObj as any).openBackupDirectory('D:/Backups/HomeConnect');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('backup:openDirectory', 'D:/Backups/HomeConnect');

    // Verify onStartupLog returns an unsubscribe function
    const onStartupLogFn = (apiObj as any).onStartupLog;
    const dummyCallback1 = () => {};
    const unsub1 = onStartupLogFn(dummyCallback1);
    expect(ipcRenderer.on).toHaveBeenCalledWith('diagnostics:startupLog', dummyCallback1);
    unsub1();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('diagnostics:startupLog', dummyCallback1);

    // Verify onStartupState returns an unsubscribe function
    const onStartupStateFn = (apiObj as any).onStartupState;
    const dummyCallback2 = () => {};
    const unsub2 = onStartupStateFn(dummyCallback2);
    expect(ipcRenderer.on).toHaveBeenCalledWith('diagnostics:startupState', dummyCallback2);
    unsub2();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('diagnostics:startupState', dummyCallback2);
  });
});
