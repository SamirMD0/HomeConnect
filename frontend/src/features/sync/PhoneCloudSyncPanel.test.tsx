import { act } from 'react';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  copy: vi.fn(),
  configured: false,
}));
vi.mock('../../services/api', () => ({ api: mock }));
vi.mock('./PairedPhonesPanel', () => ({ PairedPhonesPanel: () => 'Paired phones list' }));
import { PhoneCloudSyncPanel } from './PhoneCloudSyncPanel';
let dom: { window: Window & typeof globalThis };
let createRoot: typeof import('react-dom/client').createRoot;
beforeAll(async () => {
  // Loading jsdom before the worker handshake can exceed its timeout on Windows.
  const moduleName = 'jsdom';
  const { JSDOM } = await import(moduleName);
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  for (const name of [
    'window',
    'document',
    'navigator',
    'Node',
    'HTMLElement',
    'HTMLInputElement',
    'Event',
    'MouseEvent',
  ] as const)
    vi.stubGlobal(name, dom.window[name]);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  ({ createRoot } = await import('react-dom/client'));
}, 120000);
afterAll(() => {
  dom?.window.close();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.configured = false;
  mock.get.mockImplementation(async () => ({
    data: {
      data: {
        enabled: false,
        relayUrl: null,
        secretConfigured: mock.configured,
        openingStart: '07:00',
        openingEnd: '22:00',
        lastSuccessAt: null,
        lastError: null,
      },
    },
  }));
  mock.post.mockResolvedValue({
    data: { data: { secret: 'a'.repeat(64), sha256: 'b'.repeat(64) } },
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mock.copy },
  });
});
async function withPanel(work: (host: HTMLElement) => Promise<void>) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<PhoneCloudSyncPanel />));
    await work(host);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  }
}
const click = async (host: HTMLElement, label: string) => {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent === label);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
};
describe('click-only worker secret setup', () => {
  it('generates and saves once, copies secret/hash, and removes the one-time display on close', async () =>
    withPanel(async (host) => {
      await click(host, 'Create worker secret');
      expect(mock.post).toHaveBeenCalledExactlyOnceWith('/sync/worker/secret', {});
      expect(mock.put).not.toHaveBeenCalled();
      expect(host.querySelector('[aria-label="New worker secret"]')).not.toBeNull();
      await click(host, 'Copy worker secret');
      expect(mock.copy).toHaveBeenLastCalledWith('a'.repeat(64));
      await click(host, 'Copy SHA-256');
      expect(mock.copy).toHaveBeenLastCalledWith('b'.repeat(64));
      await click(host, 'Close secret');
      expect([...host.querySelectorAll('input')].map((input) => input.value)).not.toContain(
        'a'.repeat(64)
      );
      expect(host.querySelector('[aria-label="New worker secret"]')).toBeNull();
    }));
  it('reads the cloud usage estimate once when sync is set up, and warns when it is high', async () => {
    mock.get.mockImplementation(async (url: string) => url === '/sync/worker/usage'
      ? { data: { data: { monthToDateCuHours: 70, projectedMonthCuHours: 90, freeCuHours: 100, warn: true } } }
      : { data: { data: { enabled: true, relayUrl: 'https://relay.example.com', secretConfigured: true, openingStart: '07:00', openingEnd: '22:00', lastSuccessAt: null, lastError: null } } });
    await withPanel(async (host) => {
      await act(async () => undefined);
      expect(mock.get.mock.calls.filter(([url]) => url === '/sync/worker/usage')).toHaveLength(1);
      expect(host.textContent).toContain('about 70 of 100 hours so far, heading for about 90 (estimate)');
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('Cloud use is high');
    });
  });
  it('loads paired phones only after the relay address is saved, not while it is typed', async () => {
    // A saved secret but no saved relay: the old panel appeared as soon as an address was typed.
    mock.configured = true;
    await withPanel(async (host) => {
      await act(async () => undefined);
      expect(host.textContent).not.toContain('Paired phones list');
      const relay = host.querySelector('input[type="url"]') as HTMLInputElement;
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      await act(async () => { setValue.call(relay, 'https://relay.example.com'); relay.dispatchEvent(new window.Event('input', { bubbles: true })); });
      expect(host.textContent).not.toContain('Paired phones list');
      mock.put.mockResolvedValue({ data: { data: { enabled: false, relayUrl: 'https://relay.example.com', secretConfigured: true, openingStart: '07:00', openingEnd: '22:00', lastSuccessAt: null, lastError: null } } });
      await click(host, 'Save sync settings');
      expect(host.textContent).toContain('Paired phones list');
    });
  });
  it('does not wake the cloud for usage before sync is set up', async () =>
    withPanel(async (host) => {
      await act(async () => undefined);
      expect(mock.get).not.toHaveBeenCalledWith('/sync/worker/usage');
      expect(host.textContent).not.toContain('Cloud usage');
    }));
  it('confirms replacement before rotating an already saved secret', async () => {
    mock.configured = true;
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await withPanel(async (host) => {
      await click(host, 'Create worker secret');
      expect(window.confirm).toHaveBeenCalled();
      expect(mock.post).not.toHaveBeenCalled();
    });
  });
});
