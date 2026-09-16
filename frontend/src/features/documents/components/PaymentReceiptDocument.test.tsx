import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BusinessSettings, PaymentReceipt } from '../types/document.types';
import { PaymentReceiptDocument } from './PaymentReceiptDocument';

const business: BusinessSettings = {
  id: 'primary', returnWindowDays: 14,
  shopName: 'Home Connect هوم كونكت',
  address: 'Beirut / بيروت',
  phone: '01 234 567',
  taxNumber: 'VAT-12345',
  logoUrl: null,
  email: 'shop@example.com',
  updatedAt: '2026-09-09T08:00:00.000Z',
};

const receipt: PaymentReceipt = {
  id: '55555555-5555-4555-8555-555555555555',
  customer: { id: 'customer-1', name: 'علي الحاج', phone: '70 123 456', address: 'بيروت' },
  totalAmount: '200.00',
  currency: 'USD',
  exchangeRate: '1.000000',
  baseAmount: '200.00',
  paymentDate: '2026-09-09',
  paymentMethod: 'CASH',
  reference: 'RCPT-9',
  notes: 'دفعة شهر أيلول',
  createdAt: '2026-09-09T08:00:00.000Z',
  receivedBy: { id: 'user-1', name: 'Maya Saleh', username: 'maya' },
  allocations: [
    {
      id: 'allocation-1', targetType: 'INSTALLMENT', targetId: 'installment-1',
      obligationId: 'plan-1', description: 'Kitchen appliances — installment 1',
      amount: '120.00', currency: 'USD', paymentAmount: '120.00', paymentCurrency: 'USD', exchangeRate: '1.000000',
    },
    {
      id: 'allocation-2', targetType: 'INSTALLMENT', targetId: 'installment-2',
      obligationId: 'plan-1', description: 'Kitchen appliances — installment 2',
      amount: '80.00', currency: 'USD', paymentAmount: '80.00', paymentCurrency: 'USD', exchangeRate: '1.000000',
    },
  ],
  remainingBalances: [{ obligationType: 'INSTALLMENT_PLAN', obligationId: 'plan-1', description: 'Kitchen appliances', amount: '300.00', currency: 'USD' }],
  voidedAt: null,
  voidReason: null,
  voidedBy: null,
};

describe('PaymentReceiptDocument', () => {
  it('matches the bilingual receipt snapshot and prints split API allocations', () => {
    const html = renderToStaticMarkup(<PaymentReceiptDocument receipt={receipt} business={business} />);
    expect(html).toMatchSnapshot();
    expect(html).toContain('Kitchen appliances — installment 1');
    expect(html).toContain('Kitchen appliances — installment 2');
    expect(html).toContain('data-api-value="120.00"');
    expect(html).toContain('data-api-value="80.00"');
    expect(html).toContain('data-api-value="300.00"');
  });

  it('renders an identical document when the same stored receipt is reprinted', () => {
    const original = renderToStaticMarkup(<PaymentReceiptDocument receipt={receipt} business={business} />);
    const reprint = renderToStaticMarkup(<PaymentReceiptDocument receipt={receipt} business={business} />);
    expect(reprint).toBe(original);
  });

  it('prints a prominent bilingual VOID mark and all persisted void metadata', () => {
    const voided: PaymentReceipt = {
      ...receipt,
      voidedAt: '2026-09-10T10:15:00.000Z',
      voidReason: 'Duplicate payment / دفعة مكررة',
      voidedBy: { id: 'user-2', name: 'Rami Haddad', username: 'rami' },
    };
    const html = renderToStaticMarkup(<PaymentReceiptDocument receipt={voided} business={business} />);
    expect(html).toContain('class="document-watermark receipt-void-watermark"');
    expect(html).toContain('VOID / ملغاة');
    expect(html).toContain('Void reason');
    expect(html).toContain('سبب الإلغاء');
    expect(html).toContain('Duplicate payment / دفعة مكررة');
    expect(html).toContain('Void date');
    expect(html).toContain('تاريخ الإلغاء');
    expect(html).toContain('10/09/2026');
    expect(html).toContain('Voided by');
    expect(html).toContain('ألغيت بواسطة');
    expect(html).toContain('Rami Haddad');
  });

  it('leaves a normal receipt completely free of void markup and metadata layout', () => {
    const html = renderToStaticMarkup(<PaymentReceiptDocument receipt={receipt} business={business} />);
    expect(html).not.toContain('receipt-void-watermark');
    expect(html).not.toContain('receipt-void-metadata');
    expect(html).not.toContain('VOID / ملغاة');
    expect(html).not.toContain('Void reason');
    expect(html).not.toContain('Void date');
    expect(html).not.toContain('Voided by');
  });

  it('renders a voided receipt with a missing optional reason without crashing', () => {
    const voided: PaymentReceipt = {
      ...receipt,
      voidedAt: '2026-09-10T10:15:00.000Z',
      voidReason: null,
      voidedBy: { id: 'user-2', name: 'Rami Haddad', username: 'rami' },
    };
    const html = renderToStaticMarkup(<PaymentReceiptDocument receipt={voided} business={business} />);
    expect(html).toContain('VOID / ملغاة');
    expect(html).toContain('[Reason not recorded / السبب غير مسجل]');
  });
});
