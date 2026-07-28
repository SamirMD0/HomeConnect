import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ReceivablesFilters, resetReceivableFilters } from './ReceivablesFilters';
import {
  ReceivablesEmptyState,
  ReceivablesErrorState,
  ReceivablesLoadingState,
} from './ReceivablesStates';
import { ReceivablesSummaryCards } from './ReceivablesSummaryCards';
import { ReceivablesTable } from './ReceivablesTable';
import { StandingChip } from './StandingChip';
import { BillsPaidMeter } from './BillsPaidMeter';
import {
  ReceivableItem,
  ReceivableTierCounts,
} from '../types/receivables.types';
import {
  buildReceivableParams,
  hasActiveReceivableFilters,
  normalizeReceivableFilters,
} from '../utils/receivables-query';
import { formatDaysAgo, getReceivableTierStyle } from '../utils/receivables-tier';

const items: ReceivableItem[] = [
  {
    customer: { id: 'customer-1', name: 'Ali Ahmad', phone: '70123456', isActive: true },
    tier: 'CRITICAL',
    tierReason: '120 days late · 10% paid · escalated, under 25% paid',
    maxOverdueDays: 120,
    totalObligated: '1000.00',
    totalPaid: '100.00',
    outstanding: '900.00',
    overdueAmount: '900.00',
    paidRatioPercent: '10',
    billsTotal: 4,
    billsPaid: 0,
    openDebtCount: 1,
    activePlanCount: 1,
    overdueItemCount: 3,
    nextDueDate: '2026-03-01',
    lastPaymentDate: '2026-03-05',
    daysSinceLastPayment: 145,
    paymentCount: 1,
  },
  {
    customer: { id: 'customer-2', name: 'Maya Haddad', phone: '71123456', isActive: true },
    tier: 'CURRENT',
    tierReason: 'Nothing overdue · 75% paid',
    maxOverdueDays: 0,
    totalObligated: '400.00',
    totalPaid: '300.00',
    outstanding: '100.00',
    overdueAmount: '0.00',
    paidRatioPercent: '75',
    billsTotal: 4,
    billsPaid: 3,
    openDebtCount: 0,
    activePlanCount: 1,
    overdueItemCount: 0,
    nextDueDate: '2026-09-01',
    lastPaymentDate: '2026-07-20',
    daysSinceLastPayment: 8,
    paymentCount: 3,
  },
  {
    customer: { id: 'customer-3', name: 'Rami Saad', phone: '76123456', isActive: false },
    tier: 'NO_ACTIVITY',
    tierReason: 'No debts or installment plans recorded',
    maxOverdueDays: 0,
    totalObligated: '0.00',
    totalPaid: '0.00',
    outstanding: '0.00',
    overdueAmount: '0.00',
    paidRatioPercent: '0',
    billsTotal: 0,
    billsPaid: 0,
    openDebtCount: 0,
    activePlanCount: 0,
    overdueItemCount: 0,
    nextDueDate: null,
    lastPaymentDate: null,
    daysSinceLastPayment: null,
    paymentCount: 0,
  },
  {
    customer: { id: 'customer-4', name: 'Zeina Fares', phone: '78123456', isActive: true },
    tier: 'CRITICAL',
    tierReason: '15 days late · never paid anything',
    maxOverdueDays: 15,
    totalObligated: '250.00',
    totalPaid: '0.00',
    outstanding: '250.00',
    overdueAmount: '250.00',
    paidRatioPercent: '0',
    billsTotal: 1,
    billsPaid: 0,
    openDebtCount: 1,
    activePlanCount: 0,
    overdueItemCount: 1,
    nextDueDate: '2026-07-13',
    lastPaymentDate: null,
    daysSinceLastPayment: null,
    paymentCount: 0,
  },
];

const tierCounts: ReceivableTierCounts = {
  NO_ACTIVITY: 1,
  CURRENT: 1,
  WATCH: 0,
  LATE: 0,
  SEVERE: 0,
  CRITICAL: 1,
};

function renderTable(expanded: string[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReceivablesTable
          items={items}
          canMutate
          sortBy="standing"
          sortOrder="desc"
          expandedRows={new Set(expanded)}
          onToggleRow={() => undefined}
          onSort={() => undefined}
          onRecordPayment={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('receivables query utils', () => {
  it('applies defaults and sorts the tier filter for a stable query key', () => {
    expect(normalizeReceivableFilters({ tier: ['SEVERE', 'CRITICAL'], search: '  ali  ' })).toEqual({
      search: 'ali',
      month: undefined,
      tier: ['CRITICAL', 'SEVERE'],
      onlyWithBalance: false,
      includeInactive: false,
      page: 1,
      limit: 25,
      sortBy: 'standing',
      sortOrder: 'desc',
    });
  });

  it('drops empty values and empty tier arrays from request params', () => {
    expect(buildReceivableParams({})).toEqual({
      tier: undefined,
      month: undefined,
      onlyWithBalance: false,
      includeInactive: false,
      page: 1,
      limit: 25,
      sortBy: 'standing',
      sortOrder: 'desc',
    });
    expect(buildReceivableParams({}).tier).toBeUndefined();
    expect(buildReceivableParams({ tier: ['WATCH'], search: 'ali' })).toMatchObject({
      tier: ['WATCH'],
      search: 'ali',
    });
  });

  it('detects active filters and clears them', () => {
    expect(hasActiveReceivableFilters({})).toBe(false);
    expect(hasActiveReceivableFilters({ tier: ['WATCH'] })).toBe(true);
    expect(hasActiveReceivableFilters({ onlyWithBalance: true })).toBe(true);
    expect(hasActiveReceivableFilters({ month: '2026-07' })).toBe(true);
    expect(
      hasActiveReceivableFilters(resetReceivableFilters({ search: 'ali', month: '2026-07', page: 4 }))
    ).toBe(false);
    expect(resetReceivableFilters({ search: 'ali', page: 4 }).page).toBe(1);
  });

  it('formats the days-since-last-payment caption', () => {
    expect(formatDaysAgo(null)).toBe('');
    expect(formatDaysAgo(0)).toBe('today');
    expect(formatDaysAgo(1)).toBe('1 day ago');
    expect(formatDaysAgo(41)).toBe('41 days ago');
  });

  it('gives every tier a distinct chip style and falls back safely', () => {
    expect(getReceivableTierStyle('CRITICAL').chipClass).not.toBe(
      getReceivableTierStyle('SEVERE').chipClass
    );
    expect(getReceivableTierStyle('LEGACY' as never).label).toBe('No activity');
  });
});

describe('receivables components', () => {
  it('renders summary cards from backend totals', () => {
    const html = renderToStaticMarkup(
      <ReceivablesSummaryCards
        summary={{
          customerCount: 3,
          customersWithBalance: 2,
          customersOverdue: 1,
          atRiskCount: 1,
          totalOutstanding: '1000.00',
          totalOverdue: '900.00',
        }}
      />
    );

    expect(html).toContain('$1,000.00');
    expect(html).toContain('$900.00');
    expect(html).toContain('2 / 3');
    expect(html).toContain('1 customer overdue');
  });

  it('renders the standing chip with its explanation as an accessible label', () => {
    const html = renderToStaticMarkup(
      <StandingChip tier="SEVERE" reason="70 days late · 30% paid" />
    );

    expect(html).toContain('Severe');
    expect(html).toContain('70 days late');
    expect(html).toContain('aria-label="Severe. 70 days late');
  });

  it('renders the bills meter as a progressbar and a dash when nothing is owed', () => {
    const html = renderToStaticMarkup(
      <BillsPaidMeter billsPaid={3} billsTotal={4} paidRatioPercent="75" />
    );

    expect(html).toContain('3/4');
    expect(html).toContain('75% paid');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="75"');

    const emptyHtml = renderToStaticMarkup(
      <BillsPaidMeter billsPaid={0} billsTotal={0} paidRatioPercent="0" />
    );
    expect(emptyHtml).toContain('—');
    expect(emptyHtml).not.toContain('role="progressbar"');
  });

  it('renders a collapsed row per customer with money, standing and accessible toggles', () => {
    const html = renderTable();

    expect(html).toContain('Ali Ahmad');
    expect(html).toContain('Maya Haddad');
    expect(html).toContain('Critical');
    expect(html).toContain('Current');
    expect(html).toContain('No activity');
    expect(html).toContain('$900.00');
    expect(html).toContain('$100.00');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Show details for');
    expect(html).toContain('href="/customers/customer-1"');
    expect(html).toContain('Never');
    expect(html).toContain('· inactive');
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain('md:hidden');
    expect(html).not.toContain('id="receivable-panel-customer-1"');
  });

  it('renders the payment panel only for the expanded row', () => {
    const html = renderTable(['customer-1']);

    expect(html).toContain('id="receivable-panel-customer-1"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('id="receivable-panel-customer-2"');
  });

  it('renders filter chips with tier counts and pressed state', () => {
    const html = renderToStaticMarkup(
      <ReceivablesFilters
        filters={{ tier: ['CRITICAL'], onlyWithBalance: true }}
        tierCounts={tierCounts}
        onChange={() => undefined}
      />
    );

    expect(html).toContain('Critical · 90d+');
    expect(html).toContain('Watch · 1-30d');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Only customers with a balance');
    expect(html).toContain('Include inactive customers');
    expect(html).toContain('Clear filters');
  });

  it('renders the month filter and reflects the selected month', () => {
    const html = renderToStaticMarkup(
      <ReceivablesFilters
        filters={{ month: '2026-07' }}
        tierCounts={tierCounts}
        onChange={() => undefined}
      />
    );

    expect(html).toContain('type="month"');
    expect(html).toContain('value="2026-07"');
    expect(html).toContain('Scopes amounts to that month.');
    expect(html).toContain('Clear filters');

    const emptyHtml = renderToStaticMarkup(
      <ReceivablesFilters filters={{}} tierCounts={tierCounts} onChange={() => undefined} />
    );
    expect(emptyHtml).toContain('type="month"');
    expect(emptyHtml).not.toContain('Clear filters');
  });

  it('renders loading, error and empty states', () => {
    expect(renderToStaticMarkup(<ReceivablesLoadingState />)).toContain('animate-pulse');
    expect(renderToStaticMarkup(<ReceivablesErrorState onRetry={() => undefined} />)).toContain(
      'Accounts receivable failed to load'
    );
    expect(
      renderToStaticMarkup(<ReceivablesEmptyState filtered onClearFilters={() => undefined} />)
    ).toContain('No customers match these filters');
    expect(renderToStaticMarkup(<ReceivablesEmptyState filtered={false} />)).toContain(
      'No customers yet'
    );
  });
});
