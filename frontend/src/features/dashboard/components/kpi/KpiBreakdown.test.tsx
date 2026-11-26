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
  it('shows deposits held and the net balance under outstanding debt', () => {
    const html = renderToStaticMarkup(
      <KpiBreakdown
        kpi={{
          ...kpi,
          breakdown: [
            { key: 'depositsHeld', value: '200.00' },
            { key: 'netBalance', value: '300.00' },
          ],
        }}
      />
    );
    expect(html).toContain('Deposits held $200.00 · Net $300.00');
  });
  it('renders nothing without deposits', () => {
    expect(renderToStaticMarkup(<KpiBreakdown kpi={kpi} />)).toBe('');
  });
});
