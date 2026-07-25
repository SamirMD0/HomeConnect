import { BrowserWindow } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;
export const DEFAULT_DEV_SERVER_URL = 'http://127.0.0.1:3002';

export function createBrowserWindowOptions() {
  return {
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  };
}

export function resolveProductionFrontendPath() {
  return path.join(__dirname, '../../../../frontend/dist/index.html');
}

export const createWindow = (startUrl?: string) => {
  mainWindow = new BrowserWindow(createBrowserWindowOptions());

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || DEFAULT_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else if (startUrl) {
    mainWindow.loadURL(startUrl);
  } else {
    mainWindow.loadFile(resolveProductionFrontendPath());
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
};

export const getMainWindow = () => mainWindow;
