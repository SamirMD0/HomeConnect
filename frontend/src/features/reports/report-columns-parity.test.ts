import { describe, expect, it } from 'vitest';
import { columnsFor, summariesFor } from './components/report-columns';
import type { ReportSlice } from './types/report-rows.types';
import { REPORT_CATALOG } from '../../../../shared/report-catalog';
import { REPORT_SUMMARIES, reportColumns } from '../../../../shared/report-columns';

/**
 * The phone app renders reports from shared/report-columns.ts. This keeps it
 * showing the same columns, in the same order, with the same number
 * alignment and the same headline figures as the PC's report pages.
 */
const slices = REPORT_CATALOG.flatMap((report) =>
  report.kind === 'rows' && 'slice' in report ? [report.slice as ReportSlice] : []
);

describe('phone report columns match the PC', () => {
  it('covers every row report in the catalog', () => {
    expect(slices.length).toBeGreaterThan(20);
    for (const slice of slices) expect(reportColumns(slice).length, slice).toBeGreaterThan(0);
  });

  it.each(slices)('%s: same column labels, order and number alignment', (slice) => {
    const pc = columnsFor(slice).map((column) => [column.label, Boolean(column.numeric)]);
    const phone = reportColumns(slice).map((column) => [column.label, Boolean(column.numeric)]);
    expect(phone).toEqual(pc);
  });

  it.each(slices)('%s: same headline figures', (slice) => {
    const everyKey = new Proxy({}, { get: () => '1', has: () => true }) as Record<string, string>;
    const pc = summariesFor(slice, everyKey).map((item) => [item.label, item.money]);
    const phone = (REPORT_SUMMARIES[slice] ?? []).map((item) => [item.label, Boolean(item.money)]);
    expect(phone).toEqual(pc);
  });
});
