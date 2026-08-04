import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  selectBackupDirectory: () => ipcRenderer.invoke('backup:selectDirectory'),
  openBackupDirectory: (directory: string) => ipcRenderer.invoke('backup:openDirectory', directory),
  selectBackupFile: () => ipcRenderer.invoke('backup:selectFile'),
  openLogsFolder: () => ipcRenderer.invoke('diagnostics:openLogsFolder'),
  copyDiagnostics: (data: string) => ipcRenderer.invoke('diagnostics:copyDiagnostics', data),
  exportLabelsPdf: (options: { suggestedName: string; paper: 'A4' | 'LETTER' }) => ipcRenderer.invoke('labels:exportPdf', options),
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
