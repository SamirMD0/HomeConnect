import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PendingRepairsList } from './PendingRepairsList';
import { PreflightReportCard } from './PreflightReportCard';
import { RepairHistoryTable } from './RepairHistoryTable';
import { ResolveMigrationsPanel } from './ResolveMigrationsPanel';
import { PendingMigration, PendingRepair, PreflightReport, RepairHistoryRow } from '../types/maintenance.types';

const renderPanel = (migrations: PendingMigration[]) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <ResolveMigrationsPanel migrations={migrations} />
  </QueryClientProvider>
);

const present: PendingMigration = {
  name: '20260803090000_add_product_image',
  state: 'PENDING',
  verdict: 'PRESENT',
  reason: 'All 2 items this update creates are already in the database.',
  missing: [],
  expectedCount: 2,
};

const absent: PendingMigration = {
  name: '20260804120000_add_sales_orders',
  state: 'PENDING',
  verdict: 'MISSING',
  reason: 'The database is missing 1 of 26 items this update creates.',
  missing: ['table:sales_orders'],
  expectedCount: 26,
};

const repair: PendingRepair = {
  repairId: 'product-sku',
  title: 'Add product SKU columns',
  version: '1.1.2',
  description: 'Adds sku, stock tracking and specifications to products.',
  affectedTables: ['products'],
  requiresSuperuser: false,
};

const report: PreflightReport = {
  status: 'FAIL',
  canStart: false,
  checkedAt: '2026-08-04T10:00:00.000Z',
  appVersion: '1.2.0',
  checks: [
    { id: 'ENV_FILE', title: 'Configuration file', status: 'PASS', detail: 'Found.', fix: '' },
    {
      id: 'PASSWORD_ENCODING',
      title: 'Password encoding',
      status: 'FAIL',
      detail: 'The database password contains "@".',
      fix: 'Write it as "%40" in DATABASE_URL.',
    },
  ],
};

const historyRow: RepairHistoryRow = {
  id: 'a',
  repairId: 'product-sku',
  version: '1.1.2',
  kind: 'REPAIR',
  status: 'APPLIED',
  appliedAt: '2026-08-04T10:00:00.000Z',
  appliedByName: 'Samir',
  backupPath: 'D:/Backups/pre-repair.backup',
  durationMs: 1200,
  errorMessage: null,
};

describe('pending repairs list', () => {
  it('says the database is up to date when nothing is pending', () => {
    const html = renderToStaticMarkup(<PendingRepairsList repairs={[]} />);
    expect(html).toContain('up to date');
  });

  it('states what each repair does and what it touches, before approval', () => {
    const html = renderToStaticMarkup(<PendingRepairsList repairs={[repair]} />);
    expect(html).toContain('Add product SKU columns');
    expect(html).toContain('Adds sku, stock tracking');
    expect(html).toContain('products');
    expect(html).toContain('v1.1.2');
  });

  it('warns when a repair needs a database administrator connection', () => {
    const html = renderToStaticMarkup(<PendingRepairsList repairs={[{ ...repair, requiresSuperuser: true }]} />);
    expect(html).toContain('database administrator connection');
  });

  it('does not show that warning for an ordinary repair', () => {
    expect(renderToStaticMarkup(<PendingRepairsList repairs={[repair]} />)).not.toContain('database administrator connection');
  });
});

describe('preflight report card', () => {
  it('renders nothing before a check has been run', () => {
    expect(renderToStaticMarkup(<PreflightReportCard loading={false} />)).toBe('');
  });

  /** A red row with no stated next step is the jargon this replaces. */
  it('shows the fix for every failing check', () => {
    const html = renderToStaticMarkup(<PreflightReportCard report={report} loading={false} />);
    expect(html).toContain('Password encoding');
    expect(html).toContain('%40');
    expect(html).toContain('Problem');
  });

  it('does not invent a fix line for a passing check', () => {
    const passing = { ...report, status: 'PASS' as const, checks: [report.checks[0]] };
    expect(renderToStaticMarkup(<PreflightReportCard report={passing} loading={false} />)).not.toContain('→');
  });
});

describe('repair history table', () => {
  it('shows an empty state before anything has run', () => {
    expect(renderToStaticMarkup(<RepairHistoryTable rows={[]} />)).toContain('No repairs have been applied');
  });

  it('shows who applied what, and which backup to roll back to', () => {
    const html = renderToStaticMarkup(<RepairHistoryTable rows={[historyRow]} />);
    expect(html).toContain('product-sku');
    expect(html).toContain('Samir');
    expect(html).toContain('pre-repair.backup');
    expect(html).toContain('Applied');
  });

  it('surfaces the error message on a failed row', () => {
    const failed = { ...historyRow, status: 'VERIFY_FAILED' as const, errorMessage: 'verification failed' };
    const html = renderToStaticMarkup(<RepairHistoryTable rows={[failed]} />);
    expect(html).toContain('Verify failed');
    expect(html).toContain('verification failed');
  });
});

describe('ResolveMigrationsPanel', () => {
  it('renders nothing when no update is outstanding', () => {
    expect(renderPanel([])).toBe('');
  });

  it('offers an update whose schema is already in the database', () => {
    const html = renderPanel([present]);
    expect(html).toContain('20260803090000_add_product_image');
    expect(html).toContain('In database');
    expect(html).toContain('Record as applied');
    expect(checkboxFor(html, present.name)).not.toContain('disabled=""');
  });

  /** The safety property: an update the database is missing cannot be recorded. */
  it('disables an update whose schema is missing and names what is absent', () => {
    const html = renderPanel([absent]);
    expect(html).toContain('Not in database');
    expect(html).toContain('table:sales_orders');
    expect(checkboxFor(html, absent.name)).toContain('disabled=""');
  });

  it('states that no update SQL is executed', () => {
    expect(renderPanel([present])).toContain('none of the update');
  });

  it('shows an unknown verdict without blocking it', () => {
    const unknown = { ...present, verdict: 'UNKNOWN' as const, reason: 'No table could be detected.', expectedCount: 0 };
    const html = renderPanel([unknown]);
    expect(html).toContain('Cannot check');
    expect(checkboxFor(html, unknown.name)).not.toContain('disabled=""');
  });
});

/** The checkbox tag alone: the surrounding buttons are disabled for other reasons. */
function checkboxFor(html: string, name: string): string {
  const match = html.match(new RegExp(`<input[^>]*aria-label="Record ${name} as already applied"[^>]*>`));
  expect(match, `no checkbox rendered for ${name}`).not.toBeNull();
  return match![0];
}
