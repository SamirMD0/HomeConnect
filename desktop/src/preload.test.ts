import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contextBridge, ipcRenderer } from 'electron';

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
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
    const allowedMethods = ['ping', 'openLogsFolder', 'copyDiagnostics'];
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
  });
});
