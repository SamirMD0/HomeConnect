import { describe, expect, it } from 'vitest';
import { reportDefinitions } from './reports.registry';
import { REPORT_CATALOG } from '../../../../shared/report-catalog';

/**
 * The phone app keeps its own copy of the report list (shared/report-catalog.ts)
 * because it cannot import the desktop registry (icons, React). This test fails
 * when a report is added, removed, renamed or re-routed on the desktop without
 * updating the phone's copy.
 */
describe('mobile report catalog matches the desktop registry', () => {
  const desktop = reportDefinitions.map(({ id, title, category, kind, slice }) => ({
    id,
    title,
    category,
    kind,
    slice: slice ?? null,
  }));
  const mobile = REPORT_CATALOG.map((report) => ({
    id: report.id,
    title: report.title,
    category: report.category,
    kind: report.kind,
    slice: ('slice' in report ? report.slice : null) ?? null,
  }));

  it('has the same reports in the same order', () => {
    expect(mobile.map((report) => report.id)).toEqual(desktop.map((report) => report.id));
  });

  it('has the same title, category, kind and data slice for each report', () => {
    expect(mobile).toEqual(desktop);
  });
});
