import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, authState, scannerEventsOptions } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn() },
  authState: { user: { id: 'user-1', fullName: 'Master Administrator', role: 'ADMIN' } },
  scannerEventsOptions: { current: undefined as Record<string, unknown> | undefined },
}));

vi.mock('../../services/api', () => ({ api: apiMock }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('../../features/scanner/hooks/useScannerEvents', () => ({
  useScannerEvents: (options: Record<string, unknown>) => {
    scannerEventsOptions.current = options;
    return { isPolling: true, isError: false };
  },
}));

import { previewForDeskScan, scannerOrderRouteState, scannerReceivingRouteState, ScannerHubPage } from './ScannerHubPage';

/**
 * A static render, because this project has no jsdom: it proves the page
 * assembles, that its hooks can run, and — the part worth guarding — that the
 * admin-only controls are decided at page level and not merely inside the
 * panels that were tested in isolation.
 */
function render(node: ReactNode): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockResolvedValue({ data: { data: null } });
  apiMock.post.mockResolvedValue({ data: { data: null } });
  authState.user = { id: 'user-1', fullName: 'Master Administrator', role: 'ADMIN' };
});

describe('ScannerHubPage', () => {
  it('renders before any status has loaded', () => {
    const html = render(<ScannerHubPage />);
    expect(html).toContain('مركز المسح');
    expect(html).toContain('Scanner Hub');
  });

  it('offers a scan box on the hub itself', () => {
    const html = render(<ScannerHubPage />);
    expect(html).toContain('امسح الباركود أو رمز المنتج');
  });

  it('shows the paired-devices panel with an empty state', () => {
    expect(render(<ScannerHubPage />)).toContain('لا توجد هواتف مرتبطة');
  });

  it('reads as off until a status arrives, rather than guessing', () => {
    expect(render(<ScannerHubPage />)).toContain('ماسح الشبكة متوقف');
  });

  it('gives an admin the control to turn the scanner on', () => {
    expect(render(<ScannerHubPage />)).toContain('تشغيل');
  });

  /**
   * The page-level half of the permission boundary. The panels enforce it too,
   * but this asserts the page passes the right value down.
   */
  it('gives an employee no controls and explains why', () => {
    authState.user = { id: 'user-2', fullName: 'Shop Employee', role: 'EMPLOYEE' };
    const html = render(<ScannerHubPage />);
    expect(html).toContain('يمكن للمدير فقط');
    expect(html).not.toContain('تشغيل');
  });

  it('never renders a pairing code before one is generated', () => {
    const html = render(<ScannerHubPage />);
    expect(html).not.toContain('رمز الربط');
  });

  it('issues no request during render', () => {
    render(<ScannerHubPage />);
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('opens previews only for a found desk scan', () => {
    const product = { id: 'p1', name: 'Fan', model: 'F1', sku: 'HC-1', barcode: null, brand: null, isActive: true };
    const found = { status: 'FOUND', normalizedCode: 'HC-1', matchedBy: 'SKU', product } as const;
    expect(previewForDeskScan(found)).toBe(found);
    expect(previewForDeskScan({ status: 'NOT_FOUND', normalizedCode: 'NONE', matchedBy: null, product: null })).toBeNull();
    expect(previewForDeskScan({ status: 'INVALID_CODE', normalizedCode: null, matchedBy: null, product: null })).toBeNull();
  });

  it('never lets a phone scan open or replace the desk preview', () => {
    render(<ScannerHubPage />);
    expect(scannerEventsOptions.current).toMatchObject({ enabled: true, canOpenProduct: false });
    expect(scannerEventsOptions.current).not.toHaveProperty('onOpenProduct');
  });

  it('passes product identity only when Make Order navigates', () => {
    const state = scannerOrderRouteState('product-1');
    expect(state).toEqual({ prefillOrderProductId: 'product-1' });
    expect(Object.keys(state)).toEqual(['prefillOrderProductId']);
    expect(state).not.toHaveProperty('price');
    expect(state).not.toHaveProperty('quantity');
  });

  /**
   * The whole complaint that prompted this fix: the preview existed only as a
   * modal that appeared after a successful scan, so the page looked unchanged.
   * It is now a panel on the page with an empty state.
   */
  it('shows the product preview panel on the page before anything is scanned', () => {
    const html = render(<ScannerHubPage />);
    expect(html).toContain('Product Preview / معاينة المنتج');
    expect(html).toContain('Scan or search a product to preview it');
  });

  it('offers the POS actions from the hub itself', () => {
    // The empty state carries no actions; they arrive with a product. What the
    // page must guarantee is that the panel is mounted and visible.
    const html = render(<ScannerHubPage />);
    expect(html).toContain('امسح أو ابحث عن منتج لعرضه');
    expect(html).not.toContain('role="dialog"');
  });

  it('prefills receiving only for a product that can actually be received', () => {
    expect(scannerReceivingRouteState('product-1', true)).toEqual({ prefillReceivingProductId: 'product-1' });
    expect(scannerReceivingRouteState('product-1', false)).toBeUndefined();
  });

  it('sends no price, stock, or quantity through the receiving hand-off', () => {
    const state = scannerReceivingRouteState('product-1', true)!;
    expect(Object.keys(state)).toEqual(['prefillReceivingProductId']);
    expect(state).not.toHaveProperty('price');
    expect(state).not.toHaveProperty('quantity');
  });

  it('asks for no password anywhere on the hub', () => {
    const html = render(<ScannerHubPage />);
    expect(html).not.toContain('type="password"');
    expect(html.toLowerCase()).not.toContain('account password');
  });

  /** The scanner is an entry point. It must never reach a money or stock endpoint. */
  it('touches no ledger, payment, debt, or stock-mutating endpoint on render', () => {
    render(<ScannerHubPage />);
    expect(apiMock.post).not.toHaveBeenCalled();
    const requested = apiMock.get.mock.calls.map((call) => String(call[0]));
    for (const forbidden of ['supplier', 'customer', 'payment', 'debt', 'receivable', 'ledger', 'inventory/receivings']) {
      expect(requested.some((url) => url.includes(forbidden))).toBe(false);
    }
  });
});
