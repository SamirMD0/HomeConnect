import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { monthlyReviewQueryKey } from '../hooks/useMonthlyReview';
import type { MonthlyReviewResponse } from '../types/monthly-review.types';
import { MonthlyReviewContent } from './MonthlyReview';
import { ReportPeriodSelector } from './ReportPeriodSelector';

type ReviewEnvelope = Omit<MonthlyReviewResponse, 'success'>;

describe('monthly review components', () => {
  it('renders the backend money strings for the selected and previous periods', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <MonthlyReviewContent review={review} comparison={previousReview} />
      </MemoryRouter>
    );

    expect(html).toContain('Monthly review headline');
    expect(html).toContain('$12,345.67');
    expect(html).toContain('$9,876.54');
    expect(html).toContain('$4,321.09');
    expect(html).toContain('2026-06-01');
    expect(html).toContain('Period comparison');
    expect(html).toContain('Customer Two');
    expect(html).toContain('Supplier One');
    expect(html).toContain('No alerts');
    expect(html).toContain('Collections vs New Debt');
    expect(html).toContain('Top Supplier Balances');
  });

  it('renders this-month, last-month, and custom period controls', () => {
    const html = renderToStaticMarkup(
      <ReportPeriodSelector
        value={{ period: 'custom', from: '2026-07-01', to: '2026-07-31' }}
        onChange={() => undefined}
        onRefresh={() => undefined}
        isRefreshing={false}
      />
    );

    expect(html).toContain('This month');
    expect(html).toContain('Last month');
    expect(html).toContain('Custom');
    expect(html).toContain('aria-label="Report from date"');
    expect(html).toContain('aria-label="Report to date"');
  });

  it('puts every selected period boundary into the query key', () => {
    expect(monthlyReviewQueryKey({ period: 'thisMonth' })).not.toEqual(
      monthlyReviewQueryKey({ period: 'lastMonth' })
    );
    expect(monthlyReviewQueryKey({ period: 'custom', from: '2026-07-01', to: '2026-07-31' }))
      .toEqual(['reports', 'monthly-review', 'custom', '2026-07-01', '2026-07-31']);
  });
});

const review: ReviewEnvelope = {
  meta: {
    from: '2026-07-01', to: '2026-07-31', previousFrom: '2026-06-01', previousTo: '2026-06-30',
    preset: 'lastMonth', generatedAt: '2026-08-17T08:00:00.000Z', currency: 'USD',
  },
  data: {
    sales: {
      orderCount: 3, totalAmount: '12345.67', paidAmount: '9876.54', unpaidAmount: '2469.13',
      averageOrderValue: '4115.22', salesByDay: [], paymentStatusDistribution: [],
      fulfillmentStatusDistribution: [], topProducts: [],
    },
    customers: {
      newCustomers: 2, activeCustomers: 4, paidCount: 3, didNotPayCount: 1,
      didNotPay: [{ id: 'customer-2', name: 'Customer Two', phone: '222' }],
      movement: { ...movement('4321.09'), withDebt: 2, fullyPaid: 1, overdue: 1 },
      operationalSnapshot: {
        generatedAt: '2026-08-17T08:00:00.000Z', ageDistribution: [],
        topDebtors: [{ customerId: 'customer-1', customerName: 'Customer One', phone: '111', outstanding: '4321.09' }],
      },
    },
    suppliers: {
      movement: { ...movement('800.00'), withBalance: 1 },
      operationalSnapshot: {
        generatedAt: '2026-08-17T08:00:00.000Z', owed: '800.00', suppliersWithBalance: 1,
        topBalances: [{ supplierId: 'supplier-1', supplierName: 'Supplier One', companyName: null, balance: '800.00' }],
      },
    },
    inventory: {
      operationalSnapshot: {
        generatedAt: '2026-08-17T08:00:00.000Z',
        summary: { trackedProducts: 5, lowStockProducts: 1, outOfStockProducts: 0, totalUnits: 20, movementsToday: 2, ordersAwaitingStockDeduction: 0, recentMovements: [] },
      },
    },
    risk: { alerts: [], total: 0, operationalSnapshotAt: '2026-08-17T08:00:00.000Z' },
  },
};

const previousReview: ReviewEnvelope = {
  ...review,
  meta: { ...review.meta, from: '2026-06-01', to: '2026-06-30', previousFrom: '2026-05-01', previousTo: '2026-05-31', preset: 'custom' },
  data: {
    ...review.data,
    sales: { ...review.data.sales, totalAmount: '4000.00' },
  },
};

function movement(closing: string) {
  return { opening: '0.00', newAmount: closing, collected: '0.00', adjustments: '0.00', closing, reconciled: true };
}
