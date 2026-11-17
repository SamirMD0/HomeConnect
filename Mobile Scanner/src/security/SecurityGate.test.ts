import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  mode: 'cloud',
  ready: true,
  phase: 'locked',
  hidden: false,
  offering: false,
  previewProtected: false,
}));
vi.mock('react-native', () => ({
  View: ({ children }: { children: ReactNode }) => createElement('div', {}, children),
  Text: ({ children }: { children: ReactNode }) => createElement('span', {}, children),
  ActivityIndicator: () => null,
  Alert: { alert: vi.fn() },
}));
vi.mock('../session/SessionProvider', () => ({ useSession: () => ({ mode: state.mode }) }));
vi.mock('./SecurityProvider', () => ({
  useSecurity: () => ({
    ready: state.ready,
    controller: {},
    offering: state.offering,
    previewProtected: state.previewProtected,
  }),
  useLockState: () => ({
    phase: state.phase,
    hidden: state.hidden,
    record: { biometric: false, lockedUntil: 0 },
  }),
}));
vi.mock('../ui/AuthLayout', () => ({
  AuthLayout: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement('section', {}, title, children),
}));
vi.mock('../components/AppInput', () => ({ AppInput: () => null }));
vi.mock('../components/AppButton', () => ({
  AppButton: ({ label }: { label: string }) => createElement('button', {}, label),
}));
vi.mock('../components/StatusBanner', () => ({ StatusBanner: () => null }));
vi.mock('../offline/expo-db', () => ({ openLocalDb: vi.fn() }));
import { SecurityGate } from './SecurityGate';
beforeEach(() => {
  state.mode = 'cloud';
  state.ready = true;
  state.phase = 'locked';
  state.hidden = false;
  state.offering = false;
  state.previewProtected = false;
});
describe('cloud lock data gate', () => {
  it.each(['locked', 'setup', 'loading', 'wiping'])(
    'does not render data components during %s',
    (phase) => {
      state.phase = phase;
      const secret = vi.fn(() => createElement('p', {}, 'PRIVATE AMOUNT'));
      const html = renderToStaticMarkup(createElement(SecurityGate, {}, createElement(secret)));
      expect(secret).not.toHaveBeenCalled();
      expect(html).not.toContain('PRIVATE AMOUNT');
    }
  );
  it('shows data only after unlock and keeps the LAN path unchanged', () => {
    state.phase = 'unlocked';
    expect(renderToStaticMarkup(createElement(SecurityGate, {}, 'SHOP DATA'))).toContain(
      'SHOP DATA'
    );
    state.mode = 'lan';
    state.phase = 'locked';
    expect(renderToStaticMarkup(createElement(SecurityGate, {}, 'LAN DATA'))).toContain('LAN DATA');
  });
  it('blocks cold storage initialization and the post-setup biometric offer before mounting data', () => {
    state.phase = 'unlocked';
    state.ready = false;
    expect(renderToStaticMarkup(createElement(SecurityGate, {}, 'PRIVATE'))).not.toContain(
      'PRIVATE'
    );
    state.ready = true;
    state.offering = true;
    expect(renderToStaticMarkup(createElement(SecurityGate, {}, 'PRIVATE'))).not.toContain(
      'PRIVATE'
    );
  });
  it('unmounts background data when native preview protection is unavailable, and always unmounts locked data', () => {
    state.phase = 'unlocked';
    state.hidden = true;
    expect(renderToStaticMarkup(createElement(SecurityGate, {}, 'PRIVATE'))).not.toContain(
      'PRIVATE'
    );
    state.previewProtected = true;
    state.phase = 'locked';
    expect(renderToStaticMarkup(createElement(SecurityGate, {}, 'PRIVATE'))).not.toContain(
      'PRIVATE'
    );
  });
});
