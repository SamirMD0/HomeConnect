// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRowMenuPosition, RowMenu, RowMenuList } from './RowMenu';
import React from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('getRowMenuPosition', () => {
  const viewport = { width: 1200, height: 800 };

  it('opens below the anchor when there is room', () => {
    expect(getRowMenuPosition({ top: 100, left: 300, bottom: 140 }, 200, viewport)).toEqual({ top: 146, left: 300 });
  });

  it('flips above near the bottom of the screen', () => {
    expect(getRowMenuPosition({ top: 700, left: 300, bottom: 740 }, 200, viewport)).toEqual({ top: 494, left: 300 });
  });

  it('stays on screen near the right edge', () => {
    expect(getRowMenuPosition({ top: 100, left: 1190, bottom: 100 }, 200, viewport).left).toBe(936);
  });
});

describe('RowMenuList', () => {
  it('shows English only, even when a label is bilingual', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RowMenuList label="Actions" items={[{ label: 'Mark Delivered / تسجيل التسليم' }, { label: 'Print', to: '/print' }]} />
      </MemoryRouter>
    );
    expect(html).toContain('Mark Delivered');
    expect(html).not.toMatch(/[؀-ۿ]/);
    expect(html).toContain('href="/print"');
  });

  it('says why when a row has no actions', () => {
    const html = renderToStaticMarkup(<MemoryRouter><RowMenuList label="Actions" items={[]} emptyHint="Nothing to change." /></MemoryRouter>);
    expect(html).toContain('Nothing to change.');
  });
});

describe('RowMenu', () => {
  let host: HTMLDivElement;
  let root: Root;

  const Harness: React.FC<{ onSelect?: () => void }> = ({ onSelect }) => {
    const [open, setOpen] = React.useState(false);
    return (
      <MemoryRouter>
        <table>
          <tbody>
            <tr data-testid="row">
              <td><RowMenu open={open} onOpenChange={setOpen} items={[{ label: 'Void payment', onSelect }]} /></td>
              <td data-testid="cell">Row text <input data-testid="field" /></td>
            </tr>
          </tbody>
        </table>
      </MemoryRouter>
    );
  };

  const rightClick = (element: Element) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 });
    act(() => { element.dispatchEvent(event); });
    return event;
  };
  const menu = () => document.querySelector('[role="menu"]') as HTMLElement | null;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    window.getSelection()?.removeAllRanges();
  });

  it('opens at the cursor when the row is right-clicked', () => {
    act(() => root.render(<Harness />));
    const event = rightClick(host.querySelector('[data-testid="cell"]')!);
    expect(event.defaultPrevented).toBe(true);
    expect(menu()).not.toBeNull();
    expect(menu()!.parentElement!.style.left).toBe('300px');
  });

  it('leaves the browser menu alone on form fields', () => {
    act(() => root.render(<Harness />));
    const event = rightClick(host.querySelector('[data-testid="field"]')!);
    expect(event.defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
  });

  it('leaves the browser menu alone when text is selected, so copying still works', () => {
    act(() => root.render(<Harness />));
    const cell = host.querySelector('[data-testid="cell"]')!;
    window.getSelection()!.selectAllChildren(cell);
    const event = rightClick(cell);
    expect(event.defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
  });

  it('also opens from its button, runs the action once and closes', () => {
    const onSelect = vi.fn();
    act(() => root.render(<Harness onSelect={onSelect} />));
    act(() => (host.querySelector('button[aria-haspopup="menu"]') as HTMLElement).click());
    expect(menu()).not.toBeNull();
    act(() => (menu()!.querySelector('[role="menuitem"]') as HTMLElement).click());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it('closes on Escape and on a click elsewhere', () => {
    act(() => root.render(<Harness />));
    rightClick(host.querySelector('[data-testid="cell"]')!);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(menu()).toBeNull();
    rightClick(host.querySelector('[data-testid="cell"]')!);
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(menu()).toBeNull();
  });
});
