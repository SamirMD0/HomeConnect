import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyStockIntegrity } from './inventory.repository';

const base = {
  trackStock: false,
  stockQuantity: 0,
  movementCount: 0,
  ledgerSum: 0,
  hasOpeningBalance: false,
  lastQuantityAfter: null,
};

describe('inventory integrity classification', () => {
  it('keeps normal untracked zero-stock products out of the onboarding queue', () => {
    expect(classifyStockIntegrity(base)).toBe('NOT_IN_INVENTORY');
  });

  it('marks tracked or quantity-carrying products with no movements as pending', () => {
    expect(classifyStockIntegrity({ ...base, trackStock: true })).toBe('PENDING_ONBOARDING');
    expect(classifyStockIntegrity({ ...base, stockQuantity: 3 })).toBe('PENDING_ONBOARDING');
  });

  it('classifies matching opening ledgers as OK and all inconsistent ledgers as mismatch', () => {
    expect(classifyStockIntegrity({ ...base, trackStock: true, stockQuantity: 3, movementCount: 1, ledgerSum: 3, hasOpeningBalance: true, lastQuantityAfter: 3 })).toBe('OK');
    expect(classifyStockIntegrity({ ...base, trackStock: true, stockQuantity: 3, movementCount: 1, ledgerSum: 2, hasOpeningBalance: true, lastQuantityAfter: 2 })).toBe('MISMATCH');
    expect(classifyStockIntegrity({ ...base, trackStock: true, stockQuantity: 3, movementCount: 1, ledgerSum: 3, hasOpeningBalance: false, lastQuantityAfter: 3 })).toBe('MISMATCH');
  });

  it('defines awaiting deduction without valuation or financial arithmetic', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'inventory.repository.ts'), 'utf8');
    const query = source.slice(source.indexOf('salesOrderIdsAwaitingStockDeduction'));
    for (const status of ['CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      expect(query).toContain(status);
    }
    expect(query).toContain('OPENING_BALANCE');
    expect(query).toContain("AT TIME ZONE 'UTC' AT TIME ZONE");
    expect(query).toContain("to_regclass('public.sales_order_stock_fulfillments')");
    expect(query).toContain('p."stockQuantity" >= i."quantity"');
    expect(query).toContain('f."status" = \'ACTIVE\'');
    expect(query).not.toMatch(/costPrice|COGS|valuation|profit|margin/i);
  });

  it('guards receiving relation reads behind both new table checks', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'inventory.repository.ts'), 'utf8');
    expect(source).toContain("to_regclass('public.supplier_receivings')");
    expect(source).toContain("to_regclass('public.supplier_receiving_items')");
    expect(source).toContain('supplierReceivingTablesExist');
    expect(source).toContain('movementRelationAvailability');
  });
});
