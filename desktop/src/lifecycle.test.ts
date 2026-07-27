import { EventEmitter } from 'events';
import http from 'http';
import { describe, expect, it, vi } from 'vitest';
import {
  closeServerWithTimeout,
  focusExistingWindow,
  startupErrorMessage,
  stopChildProcessWithTimeout,
  shouldQuitAfterChildExit,
  cleanupRuntime,
} from './lifecycle';

describe('Electron lifecycle helpers', () => {
  it('focuses an existing minimized window on second launch', () => {
    const window = {
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      focus: vi.fn(),
    };

    expect(focusExistingWindow([window])).toBe(true);
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it('returns false when no window exists to focus', () => {
    expect(focusExistingWindow([])).toBe(false);
  });

  it('closes frontend server gracefully', async () => {
    const server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

    await closeServerWithTimeout(server, 100);

    expect(server.listening).toBe(false);
  });

  it('stops a child process with SIGTERM and waits for exit', async () => {
    const child = new FakeChildProcess(true);

    await stopChildProcessWithTimeout(child, 100);

    expect(child.signals).toEqual(['SIGTERM']);
  });

  it('forces child cleanup after timeout', async () => {
    const child = new FakeChildProcess(false);

    await stopChildProcessWithTimeout(child, 5);

    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('formats startup failures safely', () => {
    expect(startupErrorMessage(new Error('backend timeout'))).toBe('backend timeout');
    expect(startupErrorMessage('unknown')).toBe('Electron startup failed');
  });

  it('quits after child crash only when the app is not already quitting', () => {
    expect(shouldQuitAfterChildExit(false)).toBe(true);
    expect(shouldQuitAfterChildExit(true)).toBe(false);
  });
  it('cleans up runtime completely during retry', async () => {
    const server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

    const child = new FakeChildProcess(true);

    await cleanupRuntime(server, child as any);

    expect(server.listening).toBe(false);
    expect(child.signals).toEqual(['SIGTERM']);
  });
});

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  signals: string[] = [];

  constructor(private readonly exitsOnTerminate: boolean) {
    super();
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.signals.push(String(signal));
    if (signal === 'SIGTERM' && this.exitsOnTerminate) {
      setTimeout(() => {
        this.exitCode = 0;
        this.emit('exit', 0);
      }, 0);
    }
    return true;
  }
}
