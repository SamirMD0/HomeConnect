import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PrepaidTable } from './PrepaidTable';
import { PrepaidSummaryCards } from './PrepaidSummaryCards';
import { PrepaidStatusBadge } from './PrepaidStatusBadge';
import { PrepaidEmptyState } from './PrepaidStates';
import { PrepaidBillHistory } from './PrepaidBillHistory';
import { CustomerPrepaidHistory } from './CustomerPrepaidHistory';
import {
  PrepaidPayment,
  PrepaidPurchase,
  PrepaidSummary,
  PrepaidUser,
} from '../types/prepaid.types';
import {
  countActivePrepaidFilters,
  hasActivePrepaidFilters,
  normalizePrepaidFilters,
  resetPrepaidFilters,
  buildPrepaidParams,
} from '../utils/prepaid-query';

const admin: PrepaidUser = { id: 'u1', name: 'Admin User', username: 'admin' };

function makeBill(overrides: Partial<PrepaidPayment> = {}): PrepaidPayment {
  return {
    id: `alloc-${overrides.amount ?? '100.00'}-${overrides.paymentDate ?? '2026-07-10'}`,
    paymentId: `pay-${overrides.amount ?? '100.00'}`,
    amount: '100.00',
    paymentDate: '2026-07-10',
    paymentMethod: 'CASH',
    reference: null,
    notes: null,
    recordedBy: admin,
    isVoided: false,
    createdAt: '2026-07-10T10:00:00.000Z',
    ...overrides,
  };
}

const pendingItem: PrepaidPurchase = {
  id: 'p1',
  debtId: 'd1',
  customer: { id: 'c1', name: 'أحمد', phone: '70123456' },
  itemName: 'مكيف هواء',
  fullAmount: '400.00',
  amountPaid: '200.00',
  adminDebt: '-200.00',
  remainingToCollect: '200.00',
  dueDate: '2026-07-30',
  isFullyPaid: false,
  status: 'PENDING',
  notes: null,
  deliveredAt: null,
  deliveryNotes: null,
  deliveredBy: null,
  remainderDebtId: null,
  createdBy: admin,
  payments: [
    makeBill({ amount: '150.00', paymentDate: '2026-07-10', reference: 'R-1' }),
    makeBill({ amount: '50.00', paymentDate: '2026-07-20', reference: 'R-2' }),
  ],
  paymentCount: 2,
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
      onEdit={noop}
      onRecordPayment={noop}
      onCancel={noop}
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

  it('offers every pending prepaid mutation to financial admins', () => {
    const markup = renderToStaticMarkup(
      <PrepaidTable
        items={[pendingItem]}
        canMutate
        openMenuKey="p1"
        onOpenMenuChange={noop}
        onDeliver={noop}
        onRevertDelivery={noop}
        onViewDetails={noop}
        onEdit={noop}
        onRecordPayment={noop}
        onCancel={noop}
      />
    );

    expect(markup).toContain('Edit Purchase');
    expect(markup).toContain('Record Payment');
    expect(markup).toContain('Cancel Purchase');
  });

  it('does not expose prepaid mutations to non-admin users', () => {
    const markup = renderToStaticMarkup(
      <PrepaidTable
        items={[pendingItem]}
        canMutate={false}
        openMenuKey="p1"
        onOpenMenuChange={noop}
        onDeliver={noop}
        onRevertDelivery={noop}
        onViewDetails={noop}
        onEdit={noop}
        onRecordPayment={noop}
        onCancel={noop}
      />
    );

    expect(markup).not.toContain('Edit Purchase');
    expect(markup).not.toContain('Record Payment');
    expect(markup).not.toContain('Cancel Purchase');
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

describe('PrepaidBillHistory', () => {
  it('lists every bill instead of one total', () => {
    const markup = renderToStaticMarkup(
      <PrepaidBillHistory
        payments={[
          makeBill({ amount: '100.00', paymentDate: '2026-07-10', reference: 'R-1' }),
          makeBill({ amount: '50.00', paymentDate: '2026-07-20', reference: 'R-2' }),
          makeBill({ amount: '25.00', paymentDate: '2026-07-30', reference: 'R-3' }),
        ]}
      />
    );

    expect(markup).toContain('$100.00');
    expect(markup).toContain('$50.00');
    expect(markup).toContain('$25.00');
    expect(markup).not.toContain('$175.00');
  });

  it('shows the receipt number, method and who recorded each bill', () => {
    const markup = renderToStaticMarkup(
      <PrepaidBillHistory payments={[makeBill({ reference: 'RCPT-42' })]} />
    );

    expect(markup).toContain('RCPT-42');
    expect(markup).toContain('رقم الإيصال');
    expect(markup).toContain('Cash');
    expect(markup).toContain('Admin User');
  });

  it('keeps a voided bill visible but struck through', () => {
    const markup = renderToStaticMarkup(
      <PrepaidBillHistory payments={[makeBill({ amount: '50.00', isVoided: true })]} />
    );

    expect(markup).toContain('$50.00');
    expect(markup).toContain('line-through');
    expect(markup).toContain('ملغاة');
  });

  it('renders a bilingual empty message when no bill exists yet', () => {
    const markup = renderToStaticMarkup(<PrepaidBillHistory payments={[]} />);
    expect(markup).toContain('لم تسجل أي فاتورة بعد');
  });
});

describe('CustomerPrepaidHistory', () => {
  const customerSummary: PrepaidSummary = {
    totalAdminDebt: '-175.00',
    totalFullAmount: '1000.00',
    totalRemainingToCollect: '825.00',
    pendingCount: 3,
    deliveredCount: 0,
    cancelledCount: 0,
    customerCount: 1,
    basis: 'filtered',
  };

  const threePurchases: PrepaidPurchase[] = [
    {
      ...pendingItem,
      id: 'p1',
      itemName: 'Air conditioner',
      amountPaid: '100.00',
      adminDebt: '-100.00',
      payments: [makeBill({ amount: '100.00' })],
      paymentCount: 1,
    },
    {
      ...pendingItem,
      id: 'p2',
      itemName: 'Fridge',
      amountPaid: '50.00',
      adminDebt: '-50.00',
      payments: [makeBill({ amount: '50.00' })],
      paymentCount: 1,
    },
    {
      ...pendingItem,
      id: 'p3',
      itemName: 'Washing machine',
      amountPaid: '25.00',
      adminDebt: '-25.00',
      payments: [makeBill({ amount: '25.00' })],
      paymentCount: 1,
    },
  ];

  it('shows every prepaid purchase the customer has, not just the latest', () => {
    const markup = renderToStaticMarkup(
      <CustomerPrepaidHistory items={threePurchases} summary={customerSummary} />
    );

    expect(markup).toContain('Air conditioner');
    expect(markup).toContain('Fridge');
    expect(markup).toContain('Washing machine');
    expect(markup).toContain('-$100.00');
    expect(markup).toContain('-$50.00');
    expect(markup).toContain('-$25.00');
  });

  it('shows the backend balance for the whole set', () => {
    const markup = renderToStaticMarkup(
      <CustomerPrepaidHistory items={threePurchases} summary={customerSummary} />
    );

    expect(markup).toContain('-$175.00');
    expect(markup).toContain('الرصيد المسبق');
    expect(markup).toContain('سجل المدفوعات المسبقة');
  });

  it('offers to add another bill to an unpaid purchase only when allowed', () => {
    const withAction = renderToStaticMarkup(
      <CustomerPrepaidHistory
        items={threePurchases}
        summary={customerSummary}
        onRecordBill={noop}
      />
    );
    const readOnly = renderToStaticMarkup(
      <CustomerPrepaidHistory items={threePurchases} summary={customerSummary} />
    );

    expect(withAction).toContain('Record Payment');
    expect(readOnly).not.toContain('Record Payment');
  });

  it('hides the bill action once a purchase is fully paid', () => {
    const markup = renderToStaticMarkup(
      <CustomerPrepaidHistory
        items={[{ ...threePurchases[0], isFullyPaid: true }]}
        summary={customerSummary}
        onRecordBill={noop}
      />
    );

    expect(markup).not.toContain('Record Payment');
  });

  it('renders a bilingual empty state for a customer with no prepaid history', () => {
    const markup = renderToStaticMarkup(
      <CustomerPrepaidHistory
        items={[]}
        summary={{ ...customerSummary, pendingCount: 0, totalAdminDebt: '0.00' }}
      />
    );

    expect(markup).toContain('لا توجد مشتريات مسبقة لهذا الزبون');
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
