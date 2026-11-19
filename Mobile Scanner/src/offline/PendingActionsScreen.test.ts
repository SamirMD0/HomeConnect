import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], sync: vi.fn() }));
vi.mock('react-native', () => ({
  StyleSheet: { create: (value: unknown) => value },
  Text: ({ children }: { children: ReactNode }) => createElement('span', {}, children),
  View: ({ children }: { children: ReactNode }) => createElement('div', {}, children),
  ScrollView: ({ children }: { children: ReactNode }) => createElement('div', {}, children),
  RefreshControl: () => null,
  Pressable: ({ children }: { children: ReactNode }) => createElement('button', {}, children),
  ActivityIndicator: () => null,
}));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: () => null }));
vi.mock('../ui/ScreenHeader', () => ({
  PageTitle: ({ title }: { title: string }) => createElement('h1', {}, title),
}));
vi.mock('expo-router', () => ({ useRouter: () => ({push:vi.fn()}), useFocusEffect: (work: () => void) => work() }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('./useOutbox', () => ({
  useOutbox: () => ({ data: state.rows, isPending: false, error: null, refetch: vi.fn() }),
}));
vi.mock('./expo-db', () => ({ openLocalDb: vi.fn() }));
vi.mock('./sync-status', () => ({ requestCloudSync: state.sync, refreshFromUser: state.sync }));
import { PendingActionsScreen } from './PendingActionsScreen';
beforeEach(() => {
  state.rows = [];
  state.sync.mockClear();
});
describe('Waiting for the shop PC', () => {
  it('lists all action types and their PC result, with dismissal only for refused/failed', () => {
    state.rows = [
      'sales_order.create',
      'customer_payment.create',
      'supplier_payment.create',
      'supplier_bill.upload',
    ].map((type, index) => ({
      id: String(index),
      type,
      summary: type,
      created_at: '2026-11-17T10:00:00Z',
      local_status: ['pending', 'applied', 'refused', 'failed'][index],
      result: JSON.stringify({ message: 'Only 2 left in stock' }),
      last_error: null,
      archived: 0,
    }));
    const html = renderToStaticMarkup(createElement(PendingActionsScreen));
    for (const row of state.rows) expect(html).toContain(row.type);
    expect(html).toContain('Only 2 left in stock');
    expect(html).toContain('The shop PC could not apply this.');
    expect(html.match(/Dismiss/g)).toHaveLength(2);
    expect(state.sync).toHaveBeenCalledOnce();
  });
  it('shows retained summaries after revocation without making a network request', () => {
    state.rows = [
      {
        id: 'revoked',
        summary: 'Order · Rami',
        created_at: '2026-11-17T10:00:00Z',
        local_status: 'failed',
        archived: 1,
        last_error: 'Not sent: this phone was removed by the shop',
      },
    ];
    const html = renderToStaticMarkup(createElement(PendingActionsScreen, { archivesOnly: true }));
    expect(html).toContain('Order · Rami');
    expect(html).toContain('Not sent: this phone was removed by the shop');
    expect(state.sync).not.toHaveBeenCalled();
  });
});
