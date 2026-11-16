import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({
  StyleSheet: { create: (value: unknown) => value },
  Pressable: ({ children, disabled, accessibilityLabel }: { children: ReactNode | ((state: { pressed: boolean }) => ReactNode); disabled?: boolean; accessibilityLabel?: string }) =>
    createElement('button', { disabled, 'aria-label': accessibilityLabel }, typeof children === 'function' ? children({ pressed: false }) : children),
  Text: ({ children }: { children: ReactNode }) => createElement('span', {}, children),
  View: ({ children }: { children: ReactNode }) => createElement('div', {}, children),
  ActivityIndicator: () => null,
}));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: () => null }));
import { AppButton } from './AppButton';
import { ListRow } from './ListRow';
import { QuickGrid } from '../ui/Stats';
import { setCloudMode } from '../offline/cloud-mode';
import { CLOUD_WRITE_NOTE } from '../offline/cloud-policy';
const noop = () => {};
afterEach(() => setCloudMode(false));
describe.each([
  ['AppButton', (flag: boolean) => createElement(AppButton, { label: 'Payment', cloudWrite: flag, onPress: noop })],
  ['QuickAction', (flag: boolean) => createElement(QuickGrid, { actions: [{ label: 'Payment', icon: 'wallet-outline', onPress: noop, cloudWrite: flag }] })],
  ['ListRow', (flag: boolean) => createElement(ListRow, { title: 'Payment', cloudWrite: flag, onPress: noop })],
] as const)('%s explicit cloud-write policy', (_name, component) => {
  it('disables a flagged write with the note, regardless of its label', () => {
    setCloudMode(true);
    const html = renderToStaticMarkup(component(true));
    expect(html.match(/<button\b[^>]*>/)?.[0]).toContain('disabled=""');
    expect(html).toContain(CLOUD_WRITE_NOTE);
  });
  it('keeps the same label enabled without the explicit flag', () => {
    setCloudMode(true);
    const html = renderToStaticMarkup(component(false));
    expect(html.match(/<button\b[^>]*>/)?.[0]).not.toContain('disabled');
    expect(html).not.toContain(CLOUD_WRITE_NOTE);
  });
  it('keeps flagged controls enabled in LAN mode', () => {
    const html = renderToStaticMarkup(component(true));
    expect(html.match(/<button\b[^>]*>/)?.[0]).not.toContain('disabled');
    expect(html).not.toContain(CLOUD_WRITE_NOTE);
  });
});
