import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CreateSalesOrderDialog, salesOrderLineFromPrefill } from './CreateSalesOrderDialog';
import { PaymentStatusChip } from './PaymentStatusChip';
import { ProductLinePicker, salesLineForProduct } from './ProductLinePicker';
import type { Product } from '../../products/types/product.types';
import { SalesChannelChip } from './SalesChannelChip';
import { SalesOrderStatusChip } from './SalesOrderStatusChip';
import { SalesOrderSummaryCards } from './SalesOrderSummaryCards';
import { SalesOrderDateNavigator } from './SalesOrderDateNavigator';
import { SalesOrderInventoryPanel, SalesOrderStockActionFields } from './SalesOrderInventoryPanel';
import type { SalesOrder, SalesOrderInventoryState } from '../types/sales-orders.types';
import {
  salesOrderDisplayPaymentStatus,
  shouldShowSalesOrderSettlement,
} from '../utils/sales-order-status';
import {
  isAtLatest,
  monthBounds,
  periodCardLabels,
  rangeLabel,
  resolveRange,
  shiftDays,
  stepRange,
  todayString,
} from '../utils/sales-order-dates';

vi.mock('../../products/hooks/useProducts', () => ({
  useProducts: () => ({ data: { items: [] }, isLoading: false, isError: false }),
  useProduct: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'ADMIN' } }) }));

describe('sales order presentation components', () => {
  it('renders bilingual order, payment, and channel labels', () => {
    const html = renderToStaticMarkup(<div><SalesOrderStatusChip status="OUT_FOR_DELIVERY" /><PaymentStatusChip status="PARTIALLY_PAID" /><SalesChannelChip channel="PHONE_ORDER" /></div>);
    expect(html).toContain('Out for Delivery / في الطريق');
    expect(html).toContain('Partially Paid / مدفوع جزئياً');
    expect(html).toContain('Phone Order / طلب عبر الهاتف');
  });

  it('keeps list summaries focused on status while formatting sales money', () => {
    const html = renderToStaticMarkup(
      <SalesOrderSummaryCards
        loading={false}
        period={periodCardLabels(resolveRange('day', todayString()))}
        data={{ periodSales: '1234.50', periodOrders: 4, pendingDelivery: 2, unpaidOrders: 1, partialPayments: 1 }}
      />
    );
    expect(html).toContain('Sales Today / مبيعات اليوم');
    expect(html).toContain('$1,234.50');
    expect(html).toContain('Pending Delivery / بانتظار التوصيل');
    expect(html).not.toContain('Remaining');
  });

  it('removes a paid linked debt from the order list payment state', () => {
    const order = {
      paymentStatus: 'PARTIALLY_PAID',
      settlement: 'DEBT',
      debt: { id: 'debt-1', status: 'PAID', originalAmount: '80.00', dueDate: '2026-09-03' },
    } as const;

    expect(salesOrderDisplayPaymentStatus(order)).toBe('PAID');
    expect(shouldShowSalesOrderSettlement(order)).toBe(false);
  });

  it('starts the creation wizard with payment and does not show a discount input', () => {
    const queryClient = new QueryClient();
    const wizard = renderToStaticMarkup(<QueryClientProvider client={queryClient}><CreateSalesOrderDialog isOpen onClose={() => undefined} /></QueryClientProvider>);
    expect(wizard).toContain('Step 1 of 6');
    expect(wizard).toContain('Payment / الدفع');
    expect(wizard).not.toContain('Search customer / البحث عن زبون');

    const line = renderToStaticMarkup(<ProductLinePicker value={{ productId: null, manualProductName: '', manualProductModel: '', quantity: 1, unitPrice: '10.00', discountAmount: '0.00' }} onChange={() => undefined} />);
    expect(line).not.toContain('Discount amount / مبلغ الحسم');
    expect(line).toContain('Name, model, SKU or barcode');
    expect(line).not.toContain('<select');
  });

  it('copies the selected catalog product and its cash price into a sales line', () => {
    const line = { productId: null, manualProductName: 'Manual', manualProductModel: 'M', quantity: 2, unitPrice: '1.00', discountAmount: '0.00' };
    const selected = {
      id: 'product-after-first-100', netPrice: '12.00', price: '15.00',
      pricing: { pricingAvailable: true, cashPrice: '11.25' },
    } as Product;
    expect(salesLineForProduct(line, selected)).toMatchObject({
      productId: 'product-after-first-100', manualProductName: null, manualProductModel: null, unitPrice: '11.25', quantity: 2,
    });
  });

  it('seeds only the scanned product, quantity one, and the server-derived price', () => {
    const selected = {
      id: 'scanned-product', netPrice: '12.00', price: '15.00',
      pricing: { pricingAvailable: true, cashPrice: '11.25' },
    } as Product;
    expect(salesOrderLineFromPrefill(selected)).toEqual({
      productId: 'scanned-product', manualProductName: null, manualProductModel: null,
      quantity: 1, unitPrice: '11.25', discountAmount: '0.00',
    });
  });

  it('resolves day, month, and all ranges for the list and the summary', () => {
    expect(resolveRange('day', '2026-08-03')).toMatchObject({ dateFrom: '2026-08-03', dateTo: '2026-08-03' });
    expect(resolveRange('month', '2026-08-03')).toMatchObject({ dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    expect(resolveRange('all', '2026-08-03').dateFrom).toBeUndefined();
    expect(monthBounds('2026-02-14')).toEqual({ dateFrom: '2026-02-01', dateTo: '2026-02-28' });
  });

  it('steps whole days and months without drifting across month or year ends', () => {
    expect(shiftDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(stepRange(resolveRange('month', '2026-01-15'), -1)).toBe('2025-12-01');
    expect(stepRange(resolveRange('day', '2026-08-03'), -1)).toBe('2026-08-02');
  });

  it('never steps past today and names the recent days', () => {
    const today = todayString();
    expect(isAtLatest(resolveRange('day', today))).toBe(true);
    expect(isAtLatest(resolveRange('day', shiftDays(today, -1)))).toBe(false);
    expect(rangeLabel(resolveRange('day', today)).startsWith('Today')).toBe(true);
    expect(rangeLabel(resolveRange('day', shiftDays(today, -1))).startsWith('Yesterday')).toBe(true);
    expect(rangeLabel(resolveRange('all', today))).toBe('All dates');
  });

  it('labels the period cards for the range being shown', () => {
    expect(periodCardLabels(resolveRange('day', todayString())).sales.en).toBe('Sales Today');
    expect(periodCardLabels(resolveRange('month', todayString())).orders.en).toBe('Orders this month');
    expect(periodCardLabels(resolveRange('all', todayString())).sales.ar).toContain('كل التواريخ');
  });

  it('renders the navigator with a disabled next step while showing today', () => {
    const html = renderToStaticMarkup(
      <SalesOrderDateNavigator range={resolveRange('day', todayString())} onAnchorChange={() => undefined} onModeChange={() => undefined} />
    );
    expect(html).toContain('Previous / السابق');
    expect(html).toContain('Day / يوم');
    expect(html).toContain('Month / شهر');
    expect(html).toContain('disabled');
    expect(html).not.toContain('Today / اليوم');
  });

  it('renders server-provided inventory states and the explicit deduction action', () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(<QueryClientProvider client={queryClient}><MemoryRouter><SalesOrderInventoryPanel order={inventoryOrder([
      ['AVAILABLE', null],
      ['NEEDS_OPENING_COUNT', null],
      ['NOT_INVENTORY_LINE', null],
    ])} isAdmin /></MemoryRouter></QueryClientProvider>);
    expect(html).toContain('Deduct Stock / إخراج من المخزون');
    expect(html).toContain('Available to deduct / متاح للإخراج');
    expect(html).toContain('This product needs a verified opening count before stock actions');
    expect(html).toContain('Manual order lines cannot affect inventory');
    expect(html).not.toContain('type="password"');
  });

  it('shows restoration only to admins and keeps the restore form password-free', () => {
    const queryClient = new QueryClient();
    const order = inventoryOrder([['ALREADY_DEDUCTED', '88888888-8888-4888-8888-888888888888']]);
    const adminHtml = renderToStaticMarkup(<QueryClientProvider client={queryClient}><MemoryRouter><SalesOrderInventoryPanel order={order} isAdmin /></MemoryRouter></QueryClientProvider>);
    const employeeHtml = renderToStaticMarkup(<QueryClientProvider client={queryClient}><MemoryRouter><SalesOrderInventoryPanel order={order} isAdmin={false} /></MemoryRouter></QueryClientProvider>);
    expect(adminHtml).toContain('Restore Stock / إرجاع إلى المخزون');
    expect(adminHtml).toContain('Restore it before editing, removing, cancelling, or returning');
    expect(employeeHtml).not.toContain('Restore Stock / إرجاع إلى المخزون');

    const fields = renderToStaticMarkup(<SalesOrderStockActionFields action="restore" note="" reason="" serverError={null} onNote={() => undefined} onReason={() => undefined} />);
    expect(fields).toContain('Reason / السبب *');
    expect(fields).toContain('No account password is required');
    expect(fields).not.toContain('type="password"');
  });
});

function inventoryOrder(states: Array<[SalesOrderInventoryState, string | null]>): SalesOrder {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    orderNumber: 'SO-2026-0001',
    fulfillmentStatus: 'CONFIRMED',
    items: states.map(([state, activeFulfillmentId], index) => ({
      id: `33333333-3333-4333-8333-33333333333${index}`,
      productNameSnapshot: `Product ${index + 1}`,
      quantity: 2,
      product: state === 'NOT_INVENTORY_LINE' ? null : { stockQuantity: 10 },
      inventory: { state, activeFulfillmentId },
      stockFulfillments: activeFulfillmentId ? [{ id: activeFulfillmentId, status: 'ACTIVE' }] : [],
    })),
  } as SalesOrder;
}
