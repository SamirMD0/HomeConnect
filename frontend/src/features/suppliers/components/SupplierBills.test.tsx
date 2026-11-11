// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../api/supplier-bills.api', () => ({
  supplierBillsApi: { list: vi.fn(), forPurchase: vi.fn(), image: vi.fn(), link: vi.fn() },
}));
vi.mock('../api/supplier-purchases.api', () => ({ supplierPurchasesApi: { list: vi.fn() } }));
vi.mock('../../../components/ui', () => ({
  Button: ({
    children,
    isLoading,
    ...props
  }: ComponentProps<'button'> & { isLoading?: boolean }) => (
    <button {...props} disabled={props.disabled || isLoading}>
      {children}
    </button>
  ),
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Modal: ({
    children,
    title,
    footer,
  }: {
    children: ReactNode;
    title: string;
    footer?: ReactNode;
  }) => (
    <div role="dialog" aria-label={title}>
      {children}
      {footer}
    </div>
  ),
}));
import { SupplierBills } from './SupplierBills';
import { supplierBillsApi } from '../api/supplier-bills.api';
import { supplierPurchasesApi } from '../api/supplier-purchases.api';

let host: HTMLDivElement, root: Root;
const bill = {
  id: 'b',
  supplierId: 's',
  branchId: 'branch',
  supplierReceivingId: null,
  note: 'Page one',
  mime: 'image/jpeg',
  bytes: 100,
  capturedAt: '2026-11-11T12:00:00Z',
};
beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  URL.createObjectURL = vi.fn(() => 'blob:bill-image');
  URL.revokeObjectURL = vi.fn();
  vi.mocked(supplierBillsApi.list).mockResolvedValue([bill]);
  vi.mocked(supplierBillsApi.image).mockResolvedValue(new Blob(['photo']));
  vi.mocked(supplierBillsApi.link).mockResolvedValue(undefined);
  vi.mocked(supplierPurchasesApi.list).mockResolvedValue({
    items: [{ id: 'p', supplierReceivingId: 'r', description: 'Delivery', receiptNumber: '42' }],
    pagination: { totalPages: 1 },
  } as never);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const render = async () => {
  await act(async () => root.render(<SupplierBills supplierId="s" />));
};
function button(label: string) {
  return Array.from(host.querySelectorAll('button')).find((item) => item.textContent === label)!;
}
describe('supplier Bills tab', () => {
  it('renders bill metadata and authenticated object URLs, and filters linked/all bills', async () => {
    await render();
    expect(host.textContent).toContain('Page one');
    expect(supplierBillsApi.list).toHaveBeenLastCalledWith('s', 'false');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:bill-image');
    const select = host.querySelector('select')!;
    await act(async () => {
      select.value = 'true';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(supplierBillsApi.list).toHaveBeenLastCalledWith('s', 'true');
    await act(async () => {
      select.value = 'all';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(supplierBillsApi.list).toHaveBeenLastCalledWith('s', 'all');
  });
  it('opens the supplier purchase picker and links the selected receiving', async () => {
    await render();
    await act(async () => button('Link to purchase').click());
    expect(supplierPurchasesApi.list).toHaveBeenCalledWith('s', 1, 50);
    const picker = host.querySelector('[role="dialog"] select') as HTMLSelectElement;
    await act(async () => {
      picker.value = 'r';
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => button('Link bill').click());
    expect(supplierBillsApi.link).toHaveBeenCalledWith(bill, 'r');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it('opens the full size image, zooms, rotates and downloads without a token URL', async () => {
    await render();
    await act(async () =>
      (host.querySelector('button[aria-label^="Open bill"]') as HTMLButtonElement).click()
    );
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => button('Zoom in').click());
    expect(host.textContent).toContain('125%');
    await act(async () => button('Rotate').click());
    expect(
      (host.querySelector('img[alt="Full size supplier bill"]') as HTMLImageElement).style.transform
    ).toContain('rotate(90deg)');
    expect(host.querySelector('a[download]')?.getAttribute('href')).toBe('blob:bill-image');
  });
});
