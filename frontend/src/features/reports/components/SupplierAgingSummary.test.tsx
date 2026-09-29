import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SupplierAgingSummary } from './SupplierAgingSummary';

describe('supplier aging report presentation', () => {
  it('shows backend bucket totals, unscheduled balances, and oldest overdue without recomputing money', () => {
    const html = renderToStaticMarkup(<SupplierAgingSummary summary={{
      asOf: '2026-09-14', dueSoonDays: 7,
      buckets: [{ key: 'NO_DUE_DATE', label: 'Unscheduled / No Due Date / بدون تاريخ استحقاق', amount: '123.45' }],
      oldestOverdue: { supplierName: 'مورد', dueDate: '2026-08-01', daysOverdue: 44, remainingAmount: '67.89' },
    }} />);
    expect(html).toContain('No Due Date');
    expect(html).toContain('123.45');
    expect(html).toContain('67.89');
    expect(html).toContain('Oldest overdue payable');
    expect(html).toContain('2026-08-01');
    expect(html).toContain('dir="auto"');
  });
});
