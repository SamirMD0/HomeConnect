import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DashboardKpi } from '../../types';
import { KpiBreakdown } from './KpiBreakdown';

const kpi: DashboardKpi = {
  key: 'outstandingDebt',
  value: '500.00',
  valueKind: 'money',
  goodDirection: 'down',
  route: '/receivables',
  sparkline: [],
};

describe('KpiBreakdown', () => {
  it('shows debts, customer credit and prepaid orders under outstanding debt', () => {
    const html = renderToStaticMarkup(
      <KpiBreakdown
        kpi={{
          ...kpi,
          breakdown: [
            { key: 'debts', value: '500.00' },
            { key: 'customerCredit', value: '200.00' },
            { key: 'prepaidHeld', value: '600.00' },
          ],
        }}
      />
    );
    expect(html.replace(/<[^>]+>/g, '')).toBe(
      'Debts $500.00 · Customer credit −$200.00 · Prepaid orders held $600.00'
    );
    expect(html).toContain('<span class="whitespace-nowrap">−$200.00</span>');
  });
  it('renders nothing without deposits', () => {
    expect(renderToStaticMarkup(<KpiBreakdown kpi={kpi} />)).toBe('');
  });
});
