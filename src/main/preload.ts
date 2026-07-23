import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Define IPC methods here as needed
  ping: () => ipcRenderer.invoke('ping'),
});
