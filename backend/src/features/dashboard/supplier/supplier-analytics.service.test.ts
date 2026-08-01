import {
  SupplierTransactionDirection,
  SupplierTransactionStatus,
  SupplierTransactionType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { resolveDashboardRange } from '../shared/dashboard-range';
import { SupplierAnalyticsService } from './supplier-analytics.service';

describe('SupplierAnalyticsService', () => {
  it('nets supplier debts, payments and credits without customer data', () => {
    const supplier = { id: 's1', name: 'Source Co', companyName: null, isActive: true };
    const records = [
      tx('t1', supplier, SupplierTransactionType.SUPPLIER_DEBT, SupplierTransactionDirection.INCREASE_OWED, '500'),
      tx('t2', supplier, SupplierTransactionType.SUPPLIER_PAYMENT, SupplierTransactionDirection.DECREASE_OWED, '100'),
      tx('t3', supplier, SupplierTransactionType.SUPPLIER_CREDIT, SupplierTransactionDirection.DECREASE_OWED, '50'),
      tx('t4', supplier, SupplierTransactionType.SUPPLIER_DEBT, SupplierTransactionDirection.INCREASE_OWED, '900', SupplierTransactionStatus.REMOVED),
    ];
    const result = SupplierAnalyticsService.aggregate(records as never, resolveDashboardRange({}, '2026-08-01'), '2026-08-01', false);
    expect(result.totals).toEqual({ owed: '350.00', paid: '100.00', paidToday: '100.00', suppliersWithBalance: 1 });
    expect(result.topBalances[0]).toMatchObject({ supplierId: 's1', balance: '350.00' });
  });

  it('excludes archived suppliers unless requested', () => {
    const supplier = { id: 's2', name: 'Old', companyName: null, isActive: false };
    const records = [tx('t1', supplier, SupplierTransactionType.SUPPLIER_DEBT, SupplierTransactionDirection.INCREASE_OWED, '50')];
    const range = resolveDashboardRange({}, '2026-08-01');
    expect(SupplierAnalyticsService.aggregate(records as never, range, '2026-08-01', false).totals.owed).toBe('0.00');
    expect(SupplierAnalyticsService.aggregate(records as never, range, '2026-08-01', true).totals.owed).toBe('50.00');
  });
});

function tx(id: string, supplier: { id: string; name: string; companyName: null; isActive: boolean }, type: SupplierTransactionType, direction: SupplierTransactionDirection, amount: string, status: SupplierTransactionStatus = SupplierTransactionStatus.ACTIVE) {
  return { id, supplierId: supplier.id, supplier, type, direction, amount: new Decimal(amount), transactionDate: new Date('2026-08-01T00:00:00Z'), description: '', reference: null, notes: null, status, removedAt: null, removedById: null, removedReason: null, createdById: 'u', updatedById: null, createdAt: new Date(), updatedAt: new Date() };
}
