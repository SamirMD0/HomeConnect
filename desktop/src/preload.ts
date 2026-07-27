import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  openLogsFolder: () => ipcRenderer.invoke('diagnostics:openLogsFolder'),
  copyDiagnostics: (data: string) => ipcRenderer.invoke('diagnostics:copyDiagnostics', data),
  retryStartup: () => ipcRenderer.invoke('diagnostics:retryStartup'),
  closeApp: () => ipcRenderer.invoke('diagnostics:closeApp'),
  onStartupLog: (callback: (event: any, message: string) => void) => {
    ipcRenderer.on('diagnostics:startupLog', callback);
    return () => ipcRenderer.removeListener('diagnostics:startupLog', callback);
  },
  onStartupState: (callback: (event: any, state: any) => void) => {
    ipcRenderer.on('diagnostics:startupState', callback);
    return () => ipcRenderer.removeListener('diagnostics:startupState', callback);
  },
});
