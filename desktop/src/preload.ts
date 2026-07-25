import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  openLogsFolder: () => ipcRenderer.invoke('diagnostics:openLogsFolder'),
  copyDiagnostics: (data: string) => ipcRenderer.invoke('diagnostics:copyDiagnostics', data),
});
