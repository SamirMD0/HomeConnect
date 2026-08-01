import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PrepaidTable } from './PrepaidTable';
import { PrepaidSummaryCards } from './PrepaidSummaryCards';
import { PrepaidStatusBadge } from './PrepaidStatusBadge';
import { PrepaidEmptyState } from './PrepaidStates';
import { PrepaidPurchase, PrepaidSummary } from '../types/prepaid.types';
import {
  countActivePrepaidFilters,
  hasActivePrepaidFilters,
  normalizePrepaidFilters,
  resetPrepaidFilters,
  buildPrepaidParams,
} from '../utils/prepaid-query';

const pendingItem: PrepaidPurchase = {
  id: 'p1',
  debtId: 'd1',
  customer: { id: 'c1', name: 'أحمد', phone: '70123456' },
  itemName: 'مكيف هواء',
  fullAmount: '400.00',
  amountPaid: '200.00',
  adminDebt: '-200.00',
  remainingToCollect: '200.00',
  isFullyPaid: false,
  status: 'PENDING',
  notes: null,
  deliveredAt: null,
  deliveryNotes: null,
  deliveredBy: null,
  remainderDebtId: null,
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:00.000Z',
};

const deliveredItem: PrepaidPurchase = {
  ...pendingItem,
  id: 'p2',
  customer: { id: 'c2', name: 'Omar', phone: '71222333' },
  itemName: 'Fridge',
  fullAmount: '600.00',
  amountPaid: '300.00',
  adminDebt: '0.00',
  remainingToCollect: '300.00',
  status: 'DELIVERED',
  deliveredAt: '2026-07-25',
};

const summary: PrepaidSummary = {
  totalAdminDebt: '-200.00',
  totalFullAmount: '400.00',
  totalRemainingToCollect: '200.00',
  pendingCount: 1,
  deliveredCount: 1,
  cancelledCount: 0,
  customerCount: 1,
  basis: 'filtered',
};

const noop = () => undefined;

function renderTable(items: PrepaidPurchase[], canMutate = true) {
  return renderToStaticMarkup(
    <PrepaidTable
      items={items}
      canMutate={canMutate}
      openMenuKey={null}
      onOpenMenuChange={noop}
      onDeliver={noop}
      onRevertDelivery={noop}
      onViewDetails={noop}
    />
  );
}

describe('PrepaidTable', () => {
  it('shows the negative amount the business owes', () => {
    const markup = renderTable([pendingItem]);
    expect(markup).toContain('-$200.00');
    expect(markup).toContain('$400.00');
  });

  it('shows zero owed for a delivered record and hides its remaining amount', () => {
    const markup = renderTable([deliveredItem]);
    expect(markup).toContain('$0.00');
    expect(markup).toContain('—');
  });

  it('applies dir="auto" to customer and item text so Arabic renders correctly', () => {
    const markup = renderTable([pendingItem]);
    expect(markup).toContain('dir="auto"');
    expect(markup).toContain('أحمد');
    expect(markup).toContain('مكيف هواء');
    expect(markup).toContain('user-text');
  });

  it('renders bilingual status labels', () => {
    const markup = renderTable([pendingItem, deliveredItem]);
    expect(markup).toContain('مدفوع مسبقاً');
    expect(markup).toContain('تم التسليم');
  });

  it('renders bilingual column headers', () => {
    const markup = renderTable([pendingItem]);
    expect(markup).toContain('علينا');
    expect(markup).toContain('المتبقي');
  });
});

describe('PrepaidSummaryCards', () => {
  it('renders API totals verbatim rather than summing the rows', () => {
    const markup = renderToStaticMarkup(<PrepaidSummaryCards summary={summary} />);
    // -200.00 comes from summary.totalAdminDebt, not from the two items above.
    expect(markup).toContain('-$200.00');
    expect(markup).toContain('Current filters');
    expect(markup).toContain('إجمالي ما علينا');
  });
});

describe('PrepaidStatusBadge', () => {
  it('renders each status with its bilingual label', () => {
    expect(renderToStaticMarkup(<PrepaidStatusBadge status="PENDING" />)).toContain('مدفوع مسبقاً');
    expect(renderToStaticMarkup(<PrepaidStatusBadge status="DELIVERED" />)).toContain('تم التسليم');
    expect(renderToStaticMarkup(<PrepaidStatusBadge status="CANCELLED" />)).toContain('ملغى');
  });
});

describe('PrepaidEmptyState', () => {
  it('renders a bilingual empty message', () => {
    expect(renderToStaticMarkup(<PrepaidEmptyState />)).toContain('لا توجد مشتريات مدفوعة مسبقاً');
  });
});

describe('prepaid filter helpers', () => {
  it('defaults to awaiting-delivery records, newest first', () => {
    const normalized = normalizePrepaidFilters();
    expect(normalized.status).toBe('PENDING');
    expect(normalized.sortBy).toBe('createdAt');
    expect(normalized.sortOrder).toBe('desc');
    expect(normalized.page).toBe(1);
  });

  it('treats the default status as no active filter', () => {
    expect(hasActivePrepaidFilters({ status: 'PENDING' })).toBe(false);
    expect(hasActivePrepaidFilters({ status: 'DELIVERED' })).toBe(true);
    expect(hasActivePrepaidFilters({ search: '  ' })).toBe(false);
    expect(hasActivePrepaidFilters({ search: 'ahmad' })).toBe(true);
  });

  it('counts advanced filters', () => {
    expect(countActivePrepaidFilters({})).toBe(0);
    expect(countActivePrepaidFilters({ dateFrom: '2026-07-01', fullyPaidOnly: true })).toBe(2);
  });

  it('resets back to the defaults', () => {
    expect(resetPrepaidFilters()).toMatchObject({ status: 'PENDING', page: 1, pageSize: 25 });
  });

  it('omits empty optional params and sends fullyPaidOnly only when set', () => {
    expect(buildPrepaidParams({})).not.toHaveProperty('fullyPaidOnly');
    expect(buildPrepaidParams({})).not.toHaveProperty('search');
    expect(buildPrepaidParams({ fullyPaidOnly: true, search: ' ac ' })).toMatchObject({
      fullyPaidOnly: 'true',
      search: 'ac',
    });
  });
});
