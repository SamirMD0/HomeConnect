// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UpdateBusyProvider, useBusyLock, useBusyReasons } from './UpdateBusyContext';

let container: HTMLDivElement;
let root: Root;
const read = () => JSON.parse(container.querySelector('output')?.textContent ?? '[]') as string[];
function Lock({ id, active = true }: { id: string; active?: boolean }) {
  useBusyLock(id, active, `${id} in progress`);
  return null;
}
function Inspector() { return <output>{JSON.stringify(useBusyReasons())}</output>; }
function render(locks: Array<{ id: string; active?: boolean }>) {
  act(() => root.render(<UpdateBusyProvider><Inspector />{locks.map((lock) => <Lock key={lock.id} {...lock} />)}</UpdateBusyProvider>));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('UpdateBusyProvider', () => {
  it('starts with no reasons', () => { render([]); expect(read()).toEqual([]); });
  it('registers an active lock', () => { render([{ id: 'sale' }]); expect(read()).toEqual(['sale in progress']); });
  it('releases a lock toggled off', () => {
    render([{ id: 'sale' }]);
    render([{ id: 'sale', active: false }]);
    expect(read()).toEqual([]);
  });
  it('releases a lock when its component unmounts', () => {
    render([{ id: 'sale' }]);
    render([]);
    expect(read()).toEqual([]);
  });
  it('tracks multiple keys independently', () => {
    render([{ id: 'sale' }, { id: 'payment' }]);
    expect(read()).toEqual(['payment in progress', 'sale in progress']);
    render([{ id: 'payment' }]);
    expect(read()).toEqual(['payment in progress']);
  });
});
