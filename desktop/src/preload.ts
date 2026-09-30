import { contextBridge, ipcRenderer } from 'electron';
import type { UpdaterStatus } from './updater';

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
  exportDocumentPdf: (options: { suggestedName: string; paper: 'A4' | 'LETTER'; orientation: 'portrait' | 'landscape' }) => ipcRenderer.invoke('documents:exportPdf', options),
  /** Prints the current page one label per page at exactly this size (main process validates it). */
  printLabels: (options: { widthMm: number; heightMm: number }) => ipcRenderer.invoke('labels:print', options),
  retryStartup: () => ipcRenderer.invoke('diagnostics:retryStartup'),
  closeApp: () => ipcRenderer.invoke('diagnostics:closeApp'),
  updater: {
    checkNow: () => ipcRenderer.invoke('updater:checkNow'),
    installNow: () => ipcRenderer.invoke('updater:installNow'),
    currentStatus: () => ipcRenderer.invoke('updater:currentStatus'),
    subscribe: (cb: (status: UpdaterStatus) => void) => {
      const handler = (_event: unknown, status: UpdaterStatus) => cb(status);
      ipcRenderer.on('updater:status', handler);
      return () => ipcRenderer.off('updater:status', handler);
    },
  },
  onStartupLog: (callback: (event: any, message: string) => void) => {
    ipcRenderer.on('diagnostics:startupLog', callback);
    return () => ipcRenderer.removeListener('diagnostics:startupLog', callback);
  },
  onStartupState: (callback: (event: any, state: any) => void) => {
    ipcRenderer.on('diagnostics:startupState', callback);
    return () => ipcRenderer.removeListener('diagnostics:startupState', callback);
  },
});
