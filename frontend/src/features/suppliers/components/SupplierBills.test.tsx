// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../api/supplier-bills.api', () => ({
  supplierBillsApi: {
    list: vi.fn(),
    forPurchase: vi.fn(),
    forTransaction: vi.fn(),
    image: vi.fn(),
    link: vi.fn(),
    linkEntry: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('../api/supplier-purchases.api', () => ({ supplierPurchasesApi: { list: vi.fn() } }));
vi.mock('../api/supplier-transactions.api', () => ({ supplierTransactionsApi: { list: vi.fn() } }));
const auth = vi.hoisted(() => ({ user: { id: 'u', role: 'EMPLOYEE' } as { id: string; role: string } }));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => auth }));
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
import { supplierTransactionsApi } from '../api/supplier-transactions.api';

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
  auth.user = { id: 'u', role: 'EMPLOYEE' };
  vi.mocked(supplierTransactionsApi.list).mockResolvedValue({
    items: [
      { id: 'pay', type: 'SUPPLIER_PAYMENT', transactionDate: '2026-11-10', amount: '50.00', description: 'Cash' },
      { id: 'debt', type: 'SUPPLIER_DEBT', transactionDate: '2026-11-10', amount: '9.00', description: 'Old' },
    ],
    pagination: { totalPages: 1 },
  } as never);
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
    await act(async () => button('Link to purchase or payment').click());
    expect(supplierPurchasesApi.list).toHaveBeenCalledWith('s', 1, 50);
    const picker = host.querySelector('[role="dialog"] select') as HTMLSelectElement;
    await act(async () => {
      picker.value = 'r:r';
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
  it('offers payments in the picker and links a payment to its ledger entry', async () => {
    await render();
    await act(async () => button('Link to purchase or payment').click());
    const picker = host.querySelector('[role="dialog"] select') as HTMLSelectElement;
    const labels = Array.from(picker.options).map((option) => option.textContent);
    expect(labels.some((label) => label?.startsWith('Payment'))).toBe(true);
    expect(labels.join()).not.toContain('Old');
    await act(async () => {
      picker.value = 't:pay';
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => button('Link bill').click());
    expect(supplierBillsApi.linkEntry).toHaveBeenCalledWith(bill, 'pay');
  });
  it('loads bills for a ledger entry and pages through a multi-page bill', async () => {
    const second = { ...bill, id: 'b2', pageNumber: 2 };
    vi.mocked(supplierBillsApi.forTransaction).mockResolvedValue([
      { ...bill, supplierTransactionId: 'pay', pages: [bill, second], pageCount: 2 },
    ]);
    await act(async () => root.render(<SupplierBills transactionId="pay" />));
    expect(supplierBillsApi.forTransaction).toHaveBeenCalledWith('pay');
    expect(host.textContent).toContain('2 pages');
    await act(async () =>
      (host.querySelector('button[aria-label^="Open bill"]') as HTMLButtonElement).click()
    );
    expect(host.textContent).toContain('Page 1 of 2');
    await act(async () => button('Next page').click());
    expect(host.textContent).toContain('Page 2 of 2');
    expect(vi.mocked(supplierBillsApi.image).mock.calls.at(-1)![0]).toMatchObject({ id: 'b2' });
    // Linked bills are not deletable by employees.
    expect(button('Delete…')).toBeUndefined();
  });
  it('lets an employee delete their own fresh unlinked bill after confirming', async () => {
    vi.mocked(supplierBillsApi.list).mockResolvedValue([
      { ...bill, capturedById: 'u', capturedAt: new Date().toISOString() },
    ]);
    vi.mocked(supplierBillsApi.remove).mockResolvedValue(undefined);
    await render();
    await act(async () =>
      (host.querySelector('button[aria-label^="Open bill"]') as HTMLButtonElement).click()
    );
    await act(async () => button('Delete…').click());
    await act(async () => button('Delete bill').click());
    expect(supplierBillsApi.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), true);
  });
});
