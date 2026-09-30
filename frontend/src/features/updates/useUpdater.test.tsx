import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { useBusyReasons } from './UpdateBusyContext';
import { useUpdater, type InstallOutcome } from './useUpdater';

vi.mock('./UpdateBusyContext', () => ({ useBusyReasons: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it('blocks installation while busy without invoking IPC', async () => {
  const ipcInstall = vi.fn();
  vi.stubGlobal('window', { electronAPI: { updater: { installNow: ipcInstall } } });
  vi.mocked(useBusyReasons).mockReturnValue(['Sale in progress']);
  let install: (() => Promise<InstallOutcome>) | undefined;
  function Harness() { install = useUpdater().installNow; return null; }
  renderToStaticMarkup(<Harness />);
  expect(await install!()).toEqual({ ok: false, blocked: ['Sale in progress'] });
  expect(ipcInstall).not.toHaveBeenCalled();
});
