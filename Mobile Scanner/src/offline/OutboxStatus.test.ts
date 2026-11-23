import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  recordArrived: false,
  push: vi.fn(),
}));
vi.mock('react-native', () => ({
  StyleSheet: { create: (value: unknown) => value },
  Text: ({ children }: { children: ReactNode }) => createElement('span', {}, children),
  View: ({ children }: { children: ReactNode }) => createElement('div', {}, children),
  Pressable: ({ children }: { children: ReactNode }) => createElement('button', {}, children),
  ActivityIndicator: () => null,
}));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: () => null }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: state.recordArrived }) }));
vi.mock('./useOutbox', () => ({ useOutbox: () => ({ data: [state.row] }) }));
vi.mock('./expo-db', () => ({ openLocalDb: vi.fn() }));
vi.mock('./sync-status', () => ({ requestCloudSync: vi.fn(), refreshFromUser: vi.fn() }));
import { OutboxStatus } from './OutboxStatus';
beforeEach(() => {
  state.row = {
    id: 'action',
    type: 'sales_order.create',
    local_status: 'pending',
    result: null,
    archived: 0,
  };
  state.recordArrived = false;
});
describe('saved cloud action presentation', () => {
  it('opens a payment receipt only after the PC has returned it in an applied result',()=>{
    state.row={...state.row,type:'customer_payment.create',result:JSON.stringify({id:'p',receipt:{payment:{id:'p'}}})};
    expect(renderToStaticMarkup(createElement(OutboxStatus,{id:'action'}))).not.toContain('View and share receipt');
    state.row.local_status='applied';expect(renderToStaticMarkup(createElement(OutboxStatus,{id:'action'}))).toContain('View and share receipt');
  });
  it('does not offer an order receipt before both PC confirmation and its synced record', () => {
    expect(renderToStaticMarkup(createElement(OutboxStatus, { id: 'action' }))).not.toContain(
      'View saved order'
    );
    state.row.local_status = 'applied';
    state.row.result = JSON.stringify({ id: 'created' });
    expect(renderToStaticMarkup(createElement(OutboxStatus, { id: 'action' }))).toContain(
      'Syncing the saved order'
    );
    state.recordArrived = true;
    expect(renderToStaticMarkup(createElement(OutboxStatus, { id: 'action' }))).toContain(
      'View saved order'
    );
  });
  it('shows a PC refusal without promising a receipt', () => {
    state.row = {
      ...state.row,
      type: 'customer_payment.create',
      local_status: 'refused',
      result: JSON.stringify({ message: 'Only 2 left in stock' }),
    };
    const html = renderToStaticMarkup(createElement(OutboxStatus, { id: 'action' }));
    expect(html).toContain('Only 2 left in stock');
    expect(html).not.toContain('receipt appears here');
    expect(html).not.toContain('shop Wi-Fi');
    expect(html).not.toContain('View and share receipt');
  });

  it('says the receipt arrives with the PC result while a payment waits', () => {
    state.row = { ...state.row, type: 'customer_payment.create', local_status: 'pending', result: null };
    const html = renderToStaticMarkup(createElement(OutboxStatus, { id: 'action' }));
    expect(html).toContain('The receipt appears here as soon as the shop PC records the payment.');
    expect(html).toContain('Open Waiting list');
  });

  it('shows the new stock level and a bill that could not be attached', () => {
    state.row = {
      ...state.row,
      type: 'supplier_purchase.create',
      local_status: 'applied',
      result: JSON.stringify({ id: 'p', stockQuantity: 12, billLinked: false, billMessage: 'It stays in the bills inbox.' }),
    };
    const html = renderToStaticMarkup(createElement(OutboxStatus, { id: 'action' }));
    expect(html).toContain('Stock on the PC is now 12.');
    expect(html).toContain('It stays in the bills inbox.');
  });
});
