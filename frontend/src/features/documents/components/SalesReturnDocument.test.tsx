import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SalesReturn } from '../../sales-orders/types/sales-orders.types';
import type { BusinessSettings } from '../types/document.types';
import { SalesReturnDocument } from './SalesReturnDocument';

const business: BusinessSettings = { id: 'primary', shopName: 'Home Connect', address: 'Beirut', phone: '01', taxNumber: 'VAT-1', logoUrl: null, email: null, returnWindowDays: 14, updatedAt: null };
const salesReturn: SalesReturn = {
  id: 'return-1', returnNumber: 'SO-1-R1', salesOrderId: 'order-1', customerId: 'customer-1',
  salesOrder: { id: 'order-1', orderNumber: 'SO-1', orderDate: '2026-09-01' },
  customer: { id: 'customer-1', name: 'علي الحاج', phone: '70 000 000', address: 'بيروت' },
  returnDate: '2026-09-10', processedAt: '2026-09-10T10:00:00.000Z', reason: 'Damaged on arrival / تالف عند الوصول',
  currency: 'USD', exchangeRate: '1.000000', subtotalExVat: '90.09', vatAmount: '9.91', totalIncVat: '100.00',
  receivableReliefAmount: '50.00', refundableAmount: '50.00', refundMethod: 'CASH_OUT',
  deliveryReturned: false, deliveryTaxTreatment: null, deliveryTaxRateSnapshot: null, deliveryFeeExVat: null, deliveryVatAmount: null, deliveryFeeIncVat: null,
  processedByName: 'Maya Saleh', processedByUsername: 'maya', documentRoute: '/sales-returns/return-1',
  items: [{ id: 'line-1', productNameSnapshot: 'Fridge / براد', productModelSnapshot: 'F-1', skuSnapshot: 'SKU-1', quantity: 1, unitPriceSnapshot: '100.00', discountAmount: '0.00', subtotalExVat: '90.09', vatAmount: '9.91', totalIncVat: '100.00', taxRateSnapshot: '11.000', taxCodeSnapshot: 'VAT11', stockDisposition: 'DAMAGED', conditionNote: 'Door dent' }],
  cashRefund: { id: 'cash-1', amount: '50.00' }, customerCredit: null,
};

describe('SalesReturnDocument', () => {
  it('matches the bilingual snapshot and renders only stored transaction values', () => {
    const html = renderToStaticMarkup(<SalesReturnDocument salesReturn={salesReturn} business={business} />);
    expect(html).toMatchSnapshot();
    expect(html).toContain('SALES RETURN');
    expect(html).toContain('مرتجع مبيعات');
    expect(html).toContain('data-api-value="90.09"');
    expect(html).toContain('data-api-value="9.91"');
    expect(html).toContain('data-api-value="100.00"');
    expect(html).toContain('data-api-value="50.00"');
    expect(html).toContain('Damaged / تالف');
  });

  it('reprints identically from the same stored return payload', () => {
    expect(renderToStaticMarkup(<SalesReturnDocument salesReturn={salesReturn} business={business} />))
      .toBe(renderToStaticMarkup(<SalesReturnDocument salesReturn={salesReturn} business={business} />));
  });
});
