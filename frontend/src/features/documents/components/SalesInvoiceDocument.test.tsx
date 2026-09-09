import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SalesOrder } from '../../sales-orders/types/sales-orders.types';
import type { BusinessSettings } from '../types/document.types';
import { invoiceTotalsFromOrder, SalesInvoiceDocument } from './SalesInvoiceDocument';

const business: BusinessSettings = {
  id: 'primary',
  shopName: 'Home Connect هوم كونكت',
  address: 'Beirut / بيروت',
  phone: '01 234 567',
  taxNumber: 'VAT-12345',
  logoUrl: null,
  email: 'shop@example.com',
  updatedAt: '2026-09-09T08:00:00.000Z',
};

const order: SalesOrder = {
  id: '11111111-1111-4111-8111-111111111111',
  orderNumber: 'SO-2026-0001',
  customerId: '22222222-2222-4222-8222-222222222222',
  customer: { id: '22222222-2222-4222-8222-222222222222', name: 'علي الحاج', phone: '70 123 456', address: 'بيروت', isActive: true },
  salesChannel: 'SHOP_DELIVERY', orderDate: '2026-09-09', deliveryDate: '2026-09-10', deliveredAt: null,
  fulfillmentStatus: 'CONFIRMED', paymentStatus: 'PARTIALLY_PAID', settlement: 'DEBT',
  currency: 'USD', exchangeRate: '1.000000',
  itemsSubtotal: '90.09', itemsVatAmount: '9.91', subtotalExVat: '99.10',
  deliveryFee: '10.00', deliveryTaxTreatment: 'STANDARD', deliveryTaxRateSnapshot: '11.000',
  deliveryTaxCodeSnapshot: 'LB_STANDARD', deliveryFeeExVat: '9.01', deliveryVatAmount: '0.99', deliveryFeeIncVat: '10.00',
  vatAmount: '10.90', totalAmount: '110.00', paidAmount: '60.00', remainingAmount: '50.00',
  baseSubtotal: '90.09', baseDeliveryFee: '10.00', baseTotalAmount: '110.00', basePaidAmount: '60.00', baseRemainingAmount: '50.00',
  deliveryAddressSnapshot: 'الحمرا، بيروت', deliveryNotes: 'الطابق الثاني', notes: 'ضمان سنة',
  debtId: '33333333-3333-4333-8333-333333333333',
  debt: { id: '33333333-3333-4333-8333-333333333333', status: 'UNPAID', originalAmount: '50.00', dueDate: '2026-10-09' },
  installmentPlanId: null, installmentPlan: null,
  createdBy: { id: '44444444-4444-4444-8444-444444444444', fullName: 'Admin', username: 'admin' },
  updatedBy: null, createdAt: '2026-09-09T08:00:00.000Z', updatedAt: '2026-09-09T08:00:00.000Z',
  cancelledAt: null, cancelledReason: null,
  items: [{
    id: '55555555-5555-4555-8555-555555555555', salesOrderId: '11111111-1111-4111-8111-111111111111',
    productId: '66666666-6666-4666-8666-666666666666', product: null,
    manualProductName: null, manualProductModel: null, productNameSnapshot: 'براد أبيض', productModelSnapshot: 'FR-100', skuSnapshot: 'HC-000001',
    quantity: 1, unitPrice: '100.00', discountAmount: '0.00', lineTotal: '90.09',
    taxRateSnapshot: '11.000', taxCodeSnapshot: 'LB_STANDARD', unitPriceExVat: '90.09', vatAmount: '9.91', lineTotalIncVat: '100.00',
    notes: null, createdAt: '2026-09-09T08:00:00.000Z', updatedAt: '2026-09-09T08:00:00.000Z',
    stockFulfillments: [], inventory: { state: 'AVAILABLE', activeFulfillmentId: null },
  }],
};

describe('SalesInvoiceDocument', () => {
  it('matches the reviewed bilingual invoice snapshot and direction rules', () => {
    const html = renderToStaticMarkup(<SalesInvoiceDocument order={order} business={business} />);
    expect(html).toMatchSnapshot();
    expect(html).toContain('فاتورة مبيعات');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('dir="auto"');
    expect(html).toContain('علي الحاج');
  });

  it('passes every displayed summary amount through from the API payload without arithmetic', () => {
    expect(invoiceTotalsFromOrder(order)).toEqual({
      itemsSubtotal: '90.09',
      deliveryFeeExVat: '9.01',
      deliveryVatAmount: '0.99',
      subtotalExVat: '99.10',
      vatAmount: '10.90',
      totalAmount: '110.00',
      paidAmount: '60.00',
      remainingAmount: '50.00',
    });
    const html = renderToStaticMarkup(<SalesInvoiceDocument order={order} business={business} />);
    for (const [field, value] of Object.entries(invoiceTotalsFromOrder(order))) {
      expect(html).toContain(`data-api-field="${field}" data-api-value="${value}"`);
    }
  });

  it('prints stored product, VAT, delivery, currency, and exchange-rate snapshots', () => {
    const lbpOrder: SalesOrder = { ...order, currency: 'LBP', exchangeRate: '89500.000000' };
    const html = renderToStaticMarkup(<SalesInvoiceDocument order={lbpOrder} business={business} />);
    expect(html).toContain('براد أبيض');
    expect(html).toContain('11.000%');
    expect(html).toContain('LB_STANDARD');
    expect(html).toContain('89500.000000 LBP / USD');
    expect(html).toContain('data-api-value="10.90"');
  });

  it('uses explicit placeholders when business details have not been configured', () => {
    const empty = { ...business, shopName: null, address: null, phone: null, taxNumber: null, logoUrl: null, email: null };
    const html = renderToStaticMarkup(<SalesInvoiceDocument order={order} business={empty} />);
    expect(html).toContain('[Shop name not configured / اسم المتجر غير مضبوط]');
    expect(html).toContain('[Tax number not configured / الرقم الضريبي غير مضبوط]');
    expect(html).toContain('Logo');
    expect(html).toContain('الشعار');
  });
});
