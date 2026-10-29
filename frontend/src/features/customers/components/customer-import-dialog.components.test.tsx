import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BranchScopeContext } from '../../branches/scope/BranchScopeProvider';
import { CustomerCsvImportDialog } from './CustomerCsvImportDialog';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  CustomerImportSummary,
  CustomerImportWizard,
  importNeedsResolution,
  customerImportSteps,
} from './CustomerCsvImportDialog';
import type { CustomerImportPreview } from '../api/customer-import.api';

const preview: CustomerImportPreview = {
  id: 'draft',
  branchId: 'a',
  branch: { id: 'a', name: 'فرع بيروت' },
  fileName: 'customers.csv',
  status: 'DRAFT',
  headers: ['Name', 'Phone'],
  columnMapping: { name: 0, phone: 1 },
  previousCommittedImport: null,
  summary: { total: 1, ready: 1, conflicts: 0, invalid: 0 },
  planned: { created: 1, updated: 0, skipped: 0, openingDebts: 1, openingDebtTotalUsd: '10.00' },
  rows: [
    {
      rowNumber: 2,
      name: 'علي',
      phone: '03123456',
      phoneKey: '03123456',
      openingBalance: '10',
      currency: 'USD',
      status: 'READY',
      issues: [],
      conflicts: [],
      matches: [],
      decision: { rowNumber: 2, action: 'CREATE' },
    },
  ],
  result: null,
};
function render(
  step: number,
  overrides: Partial<React.ComponentProps<typeof CustomerImportWizard>> = {}
) {
  return renderToStaticMarkup(
    <CustomerImportWizard
      step={step}
      branchId="a"
      branchName="فرع بيروت"
      branches={[
        { id: 'a', name: 'فرع بيروت' },
        { id: 'b', name: 'Branch B' },
      ]}
      preview={preview}
      mapping={preview.columnMapping}
      result={{ ...preview.planned, reportCsv: 'Row,Reason' }}
      password=""
      busy={false}
      error=""
      hasFile
      onBranch={vi.fn()}
      onFile={vi.fn()}
      onMapping={vi.fn()}
      onDecision={vi.fn()}
      onPassword={vi.fn()}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onRefresh={vi.fn()}
      {...overrides}
    />
  );
}
describe('customer CSV import dialog', () => {
  it('the live dialog preselects a single header branch and requires an explicit choice from All', () => {
    const branches = [
      { id: 'a', code: 'A', name: 'Branch A', address: null, phone: null, isActive: true },
      { id: 'b', code: 'B', name: 'Branch B', address: null, phone: null, isActive: true },
    ];
    const session = (all: boolean) =>
      renderToStaticMarkup(
        <QueryClientProvider client={new QueryClient()}>
          <BranchScopeContext.Provider
            value={{
              ready: true,
              branches,
              selection: all ? { kind: 'all' } : { kind: 'branch', branchId: 'a' },
              selectedBranch: all ? null : branches[0],
              select: vi.fn(),
            }}
          >
            <CustomerCsvImportDialog open onClose={vi.fn()} />
          </BranchScopeContext.Provider>
        </QueryClientProvider>
      );
    expect(session(true)).toMatch(/<button[^>]*disabled=""[^>]*>Continue/);
    expect(session(false)).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue/);
    expect(session(false)).toContain('Importing into:');
  });

  it.each(customerImportSteps.map((label, index) => [label, index] as const))(
    'renders step %s with its destination banner',
    (_label, step) => {
      const html = render(step);
      expect(html).toContain('Importing into:');
      expect(html).toContain('فرع بيروت');
      expect(html).toContain('dir="auto"');
      expect(html).toContain('aria-current="step"');
    }
  );
  it('forces a destination choice in All branches before continuing', () => {
    const html = render(0, { branchId: '', branchName: '', preview: null });
    expect(html).toContain('Select a branch');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue/);
    expect(render(0)).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue/);
  });
  it('requires an uploaded file and mapped name and phone', () => {
    expect(render(1, { hasFile: false })).toMatch(/<button[^>]*disabled=""[^>]*>Continue/);
    expect(render(2, { mapping: { name: 0 } })).toMatch(/<button[^>]*disabled=""[^>]*>Continue/);
  });
  it('gates opening-debt commits with an account password and displays USD totals', () => {
    const html = render(5);
    expect(html).toContain('type="password"');
    expect(html).toContain('$10.00');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Commit import/);
    expect(render(5, { password: 'synthetic-password' })).not.toMatch(
      /<button[^>]*disabled=""[^>]*>Commit import/
    );
    const noDebt = {
      ...preview,
      planned: { ...preview.planned, openingDebts: 0, openingDebtTotalUsd: '0.00' },
    };
    expect(render(5, { preview: noDebt })).not.toContain('type="password"');
  });
  it('prevents unresolved duplicates and already-imported opening amounts from proceeding', () => {
    expect(importNeedsResolution(preview)).toBe(false);
    expect(
      importNeedsResolution({
        ...preview,
        rows: [preview.rows[0], { ...preview.rows[0], rowNumber: 3 }],
      })
    ).toBe(true);
    const update = {
      ...preview.rows[0],
      matches: [{ id: 'customer', name: 'علي', hasImportedOpeningDebt: true }],
      decision: { rowNumber: 2, action: 'UPDATE' as const, targetCustomerId: 'customer' },
    };
    expect(importNeedsResolution({ ...preview, rows: [update] })).toBe(true);
    expect(
      importNeedsResolution({
        ...preview,
        rows: [{ ...update, decision: { ...update.decision, skipOpeningBalance: true } }],
      })
    ).toBe(false);
  });
  it('shows the repeat-import warning, contact-field decisions and downloadable results', () => {
    expect(
      render(4, {
        preview: {
          ...preview,
          previousCommittedImport: { id: 'previous', fileName: 'customers.csv' },
        },
      })
    ).toContain('already imported into this branch');
    expect(render(4)).toContain('Action for row 2');
    const html = render(6);
    expect(html).toContain('download="customer-import-skipped.csv"');
    expect(html).toContain('data:text/csv');
    expect(html).toContain('$10.00');
    expect(
      renderToStaticMarkup(
        <CustomerImportSummary
          result={{
            created: 2,
            updated: 3,
            skipped: 4,
            openingDebts: 1,
            openingDebtTotalUsd: '19.55',
          }}
        />
      )
    ).toContain('$19.55');
  });
});

describe('account-based customer import controls', () => {
  it('allows account mapping without phone and explains trial-balance detection in English', () => {
    const html = render(2, {
      mapping: { name: 1, accountCode: 0 },
      preview: { ...preview, format: 'TRIAL_BALANCE', headers: ['Account', 'Name'] },
    });
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue/);
    expect(html).toContain('Balance Debit supplies the opening debt');
    expect(html).toContain('Phone is optional');
    expect(html).toContain('Account number');
  });
  it('distinguishes missing phones using accounts and blocks duplicate account selections', () => {
    const row = {
      ...preview.rows[0],
      phone: '',
      phoneKey: '',
      accountCode: '00123',
      identityKey: 'ACCOUNT:00123',
    };
    expect(
      importNeedsResolution({
        ...preview,
        rows: [row, { ...row, rowNumber: 3, accountCode: '00124', identityKey: 'ACCOUNT:00124' }],
      })
    ).toBe(false);
    expect(importNeedsResolution({ ...preview, rows: [row, { ...row, rowNumber: 3 }] })).toBe(true);
    expect(render(3, { preview: { ...preview, rows: [row] } })).toContain('00123');
  });
});
