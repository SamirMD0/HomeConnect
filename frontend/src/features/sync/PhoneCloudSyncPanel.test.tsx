// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, it, expect, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  copy: vi.fn(),
  configured: false,
}));
vi.mock('../../services/api', () => ({ api: mock }));
vi.mock('./PairedPhonesPanel', () => ({ PairedPhonesPanel: () => null }));
import { PhoneCloudSyncPanel } from './PhoneCloudSyncPanel';
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
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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
