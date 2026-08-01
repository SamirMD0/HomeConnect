import { DebtKind, DebtStatus, PaymentMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';
import { resolveDashboardRange } from '../shared/dashboard-range';
import { CustomerAnalyticsService } from './customer-analytics.service';

const customer = { id: 'c1', name: 'Ali', phone: '1' };
const userFields = { createdById: 'u1' };

describe('CustomerAnalyticsService', () => {
  it('uses allocation-aware balances, excludes prepaid/cancelled records, and deduplicates payers', () => {
    const result = CustomerAnalyticsService.aggregate(
      {
        totalCustomers: 1,
        debts: [
          debt({ id: 'd1', originalAmount: new Decimal('100'), dueDate: day('2026-07-01'), paymentAllocations: [allocation('25')] }),
          debt({ id: 'd2', kind: DebtKind.PREPAID_PURCHASE, originalAmount: new Decimal('900') }),
          debt({ id: 'd3', status: DebtStatus.CANCELLED, cancelledAt: new Date(), originalAmount: new Decimal('500') }),
        ],
        plans: [],
        payments: [payment('p1', '10'), payment('p2', '15')],
      } as never,
      resolveDashboardRange({ range: 'month' }, '2026-08-01'),
      '2026-08-01',
      true
    );
    expect(result.totals).toMatchObject({ collected: '25.00', distinctPayers: 1, outstanding: '75.00', overdueCustomers: 1 });
    expect(result.today).toMatchObject({ collected: '25.00', distinctPayers: 1 });
    expect(result.topDebtors?.[0]).toMatchObject({ customerId: 'c1', outstanding: '75.00' });
  });

  it('omits debtor identities for non-admin users', () => {
    const result = CustomerAnalyticsService.aggregate(
      { totalCustomers: 0, debts: [], plans: [], payments: [] },
      resolveDashboardRange({}, '2026-08-01'),
      '2026-08-01',
      false
    );
    expect(result).not.toHaveProperty('topDebtors');
  });
});

function day(value: string) { return new Date(`${value}T00:00:00Z`); }
function allocation(amount: string) {
  return { id: `a${amount}`, amount: new Decimal(amount), voidedAt: null, paymentId: 'p', debtId: 'd1', installmentId: null, createdAt: new Date(), voidedById: null, correctionId: null, payment: { voidedAt: null, paymentDate: day('2026-08-01') } };
}
function debt(overrides: Record<string, unknown>) {
  return { id: 'd', customerId: customer.id, customer, description: 'Debt', kind: DebtKind.STANDARD, originalAmount: new Decimal('0'), dueDate: day('2026-08-01'), status: DebtStatus.UNPAID, notes: null, ...userFields, createdAt: new Date('2026-08-01T08:00:00Z'), updatedAt: new Date(), cancelledAt: null, cancelledById: null, cancelReason: null, paymentAllocations: [], ...overrides };
}
function payment(id: string, amount: string) {
  return { id, customerId: customer.id, customer, totalAmount: new Decimal(amount), paymentDate: day('2026-08-01'), paymentMethod: PaymentMethod.CASH, reference: null, notes: null, idempotencyKey: null, ...userFields, createdAt: new Date(), voidedAt: null, voidedById: null, voidReason: null };
}
