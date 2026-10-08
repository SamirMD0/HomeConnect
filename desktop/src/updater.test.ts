import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startUpdateChecker } from './updater';

const { ipcHandle } = vi.hoisted(() => ({ ipcHandle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: ipcHandle } }));
vi.mock('electron-updater', () => ({ autoUpdater: {} }));

class FakeAutoUpdater extends EventEmitter {
  checkForUpdates = vi.fn<() => Promise<unknown>>(() => Promise.resolve(null));
  quitAndInstall = vi.fn();
  autoDownload = false;
  autoInstallOnAppQuit = true;
  allowDowngrade = true;
  allowPrerelease = true;
}

const mainWindow = () => ({ webContents: { send: vi.fn() }, isDestroyed: () => false });
const logger = () => ({ info: vi.fn(), error: vi.fn() });
const timers = () => ({ setTimeout, setInterval, clearTimeout, clearInterval });
const start = (updater = new FakeAutoUpdater(), log = logger()) => {
  const window = mainWindow();
  const handle = startUpdateChecker(window as any, { autoUpdater: updater as any, logger: log, timers: timers() });
  return { updater, log, window, handle };
};

describe('startUpdateChecker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env.HOME_CONNECT_UPDATE_DISABLED;
  });

  afterEach(() => {
    delete process.env.HOME_CONNECT_UPDATE_DISABLED;
    vi.useRealTimers();
  });

  it('is a no-op when disabled by env', () => {
    process.env.HOME_CONNECT_UPDATE_DISABLED = '1';
    const updater = new FakeAutoUpdater();
    const handle = startUpdateChecker(mainWindow() as any, { autoUpdater: updater as any, logger: logger(), timers: timers() });
    vi.advanceTimersByTime(60_000);
    expect(handle.currentStatus()).toEqual({ state: 'idle' });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('does not check before the initial delay', async () => {
    const { updater, handle } = start();
    vi.advanceTimersByTime(59_999);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    handle.stop();
  });

  it('checkNow bypasses delay and is single-flight', async () => {
    const pending = new Promise<unknown>(() => undefined);
    const updater = new FakeAutoUpdater();
    updater.checkForUpdates.mockReturnValue(pending);
    const { handle } = start(updater);
    const first = handle.checkNow();
    const second = handle.checkNow();
    await Promise.resolve();
    expect(second).toBe(first);
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    handle.stop();
  });

  it('swallows check errors and logs at INFO', async () => {
    const updater = new FakeAutoUpdater();
    updater.checkForUpdates.mockRejectedValue(new Error('private URL'));
    const { handle, log } = start(updater);
    await expect(handle.checkNow()).resolves.toBeUndefined();
    expect(log.info).toHaveBeenCalledWith('updater: check-failed');
    expect(log.error).not.toHaveBeenCalled();
    handle.stop();
  });

  it('logs SHA-512 mismatch at ERROR', () => {
    const { updater, handle, log } = start();
    updater.emit('error', new Error('sha512 checksum mismatch at secret URL'));
    expect(log.error).toHaveBeenCalledWith('updater: sha512-mismatch');
    expect(handle.currentStatus()).toMatchObject({ state: 'error', error: 'sha512-mismatch' });
    handle.stop();
  });

  it('throttles download progress', () => {
    const { updater, window, handle } = start();
    for (let i = 0; i < 10; i += 1) updater.emit('download-progress', { percent: i });
    expect(window.webContents.send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_100);
    updater.emit('download-progress', { percent: 50 });
    expect(window.webContents.send).toHaveBeenCalledTimes(2);
    handle.stop();
  });

  it('publishes the expected state transitions', () => {
    const { updater, handle } = start();
    const states = [handle.currentStatus().state];
    for (const [event, value] of [['checking-for-update'], ['update-available', { version: '2.1.0' }], ['download-progress', { percent: 25 }], ['update-downloaded', { version: '2.1.0' }]] as const) {
      updater.emit(event, value); states.push(handle.currentStatus().state);
    }
    expect(states).toEqual(['idle', 'checking', 'available', 'downloading', 'ready']);
    handle.stop();
  });

  it('keeps the old app running when recovery preparation fails', async () => {
    const updater = new FakeAutoUpdater();
    const handle = startUpdateChecker(mainWindow() as any, { autoUpdater: updater as any, logger: logger(),
      beforeInstall: vi.fn().mockRejectedValue(new Error('backup failed')) });
    updater.emit('update-downloaded', { version: '2.0.7' });
    await expect(handle.installNow()).rejects.toThrow('previous version');
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    handle.stop();
  });

  it('waits for recovery preparation and suppresses duplicate install requests', async () => {
    const updater = new FakeAutoUpdater();
    let complete!: () => void;
    const beforeInstall = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    const handle = startUpdateChecker(mainWindow() as any, { autoUpdater: updater as any, logger: logger(), beforeInstall });
    updater.emit('update-downloaded', { version: '2.0.7' });
    const first = handle.installNow();
    await handle.installNow();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(beforeInstall).toHaveBeenCalledOnce();
    complete();
    await first;
    expect(updater.quitAndInstall).toHaveBeenCalledOnce();
    handle.stop();
  });

  it('does not offer or reinstall a version that was automatically rolled back', async () => {
    const updater = new FakeAutoUpdater();
    const handle = startUpdateChecker(mainWindow() as any, { autoUpdater: updater as any, logger: logger(), rejectedVersion: '2.0.7' });
    updater.emit('update-available', { version: '2.0.7' });
    updater.emit('download-progress', { percent: 100 });
    updater.emit('update-downloaded', { version: '2.0.7' });
    expect(handle.currentStatus().state).toBe('idle');
    await handle.installNow();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updater.emit('update-downloaded', { version: '2.0.8' });
    expect(handle.currentStatus()).toMatchObject({ state: 'ready', version: '2.0.8' });
    handle.stop();
  });
});
