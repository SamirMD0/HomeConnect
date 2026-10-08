// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartViewport } from './ChartViewport';
import { KpiSparkline } from '../kpi/KpiSparkline';

let container: HTMLDivElement;
let root: Root;
let notifyResize: ResizeObserverCallback;
const disconnect = vi.fn();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { notifyResize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  disconnect.mockClear();
});

function resize(width: number, height: number) {
  act(() => notifyResize([
    { contentRect: { width, height } } as ResizeObserverEntry,
  ], {} as ResizeObserver));
}

describe('chart sizing', () => {
  it('waits for both dimensions and remounts after a hidden container becomes visible', () => {
    act(() => root.render(<ChartViewport><span>Chart content</span></ChartViewport>));
    expect(container.textContent).toBe('');
    resize(500, 0);
    expect(container.textContent).toBe('');
    resize(0, 280);
    expect(container.textContent).toBe('');
    resize(500, 280);
    expect(container.textContent).toBe('Chart content');
    resize(0, 0);
    expect(container.textContent).toBe('');
    resize(300, 280);
    expect(container.textContent).toBe('Chart content');
    act(() => root.render(null));
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('renders immediately when layout already has a size', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 500, height: 280 } as DOMRect);
    act(() => root.render(<ChartViewport><span>Chart content</span></ChartViewport>));
    expect(container.textContent).toBe('Chart content');
  });

  it('renders a fixed-size sparkline even before parent layout is measured', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    act(() => root.render(<KpiSparkline data={[{ bucket: 'a', value: 1 }, { bucket: 'b', value: 2 }]} />));
    const svg = container.querySelector('svg.recharts-surface');
    expect(svg?.getAttribute('width')).toBe('64');
    expect(svg?.getAttribute('height')).toBe('32');
    expect(warn.mock.calls.some(([message]) => String(message).includes('should be greater than 0'))).toBe(false);
  });
});
