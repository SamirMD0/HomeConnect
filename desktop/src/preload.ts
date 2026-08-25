import { contextBridge, ipcRenderer } from 'electron';

// The renderer runs with `sandbox: true`, so this preload may only require
// 'electron' and a handful of builtins — a relative import of the channel
// constant fails at load with "module not found". Channel names stay inline
// here; `whatsapp-link.test.ts` and `preload.test.ts` pin both sides to the
// same literal.

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  /** Customer communication: main-process-validated https://wa.me links only. */
  openWhatsApp: (url: string) => ipcRenderer.invoke('comm:openWhatsApp', url),
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
