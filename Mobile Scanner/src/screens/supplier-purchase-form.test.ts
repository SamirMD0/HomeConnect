import { describe, expect, it } from 'vitest';
import {
  issueForInvoice, lineSubtotal, moneyMinorUnits, moneyText, newPurchaseLine,
  toApiLine, today,
} from './supplier-purchase-form';

const product = {
  id: 'product-1', name: 'Filter', model: 'A', sku: 'HC-1',
  priceCurrency: 'USD' as const, trackStock: true, stockQuantity: 2,
  notInInventory: false,
};

describe('supplier invoice form values', () => {
  it('uses exact minor units for quantities and rejects fractional LBP', () => {
    const line = { ...newPurchaseLine('one'), product, quantity: '3', unitPrice: '0.10' };
    expect(lineSubtotal(line, 'USD')).toBe(30);
    expect(moneyText(lineSubtotal(line, 'USD')!, 'USD')).toBe('0.30');
    expect(moneyMinorUnits('1000.50', 'LBP')).toBeNull();
    expect(moneyMinorUnits('1000', 'LBP')).toBe(1000);
  });

  it('blocks duplicate products and products that cannot receive stock', () => {
    const first = { ...newPurchaseLine('one'), product, unitPrice: '10.00' };
    const duplicate = { ...first, key: 'two' };
    expect(issueForInvoice([first, duplicate], 'USD', true, today(), '', '20.00')).toContain('duplicate');
    expect(issueForInvoice([{ ...first, product: { ...product, trackStock: false } }], 'USD', true, today(), '', '10.00')).toContain('cannot receive');
  });

  it('preserves product and manual line meaning in the POST body', () => {
    const existing = { ...newPurchaseLine('one'), product, unitPrice: '12.50', quantity: '2', priceIncludesVat: true };
    const manual = { ...newPurchaseLine('two'), kind: 'MANUAL' as const, description: 'Delivery', amount: '5.00' };
    expect(toApiLine(existing, 'USD')).toEqual({ kind: 'EXISTING_PRODUCT', productId: 'product-1', quantity: 2, unitPrice: '12.50', priceIncludesVat: true });
    expect(toApiLine(manual, 'USD')).toEqual({ kind: 'MANUAL', description: 'Delivery', amount: '5.00', priceIncludesVat: false });
  });
});
