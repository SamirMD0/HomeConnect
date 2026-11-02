import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BranchScopeContext } from '../../branches/scope/BranchScopeProvider';
import { CustomerCsvImportDialog } from './CustomerCsvImportDialog';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  CustomerImportSummary,
  CustomerImportWizard,
  balanceChangeText,
  branchMoveMessage,
  importNeedsResolution,
  rowsChangedFirst,
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
  branches: [
    { id: 'a', code: 'A', name: 'فرع بيروت' },
    { id: 'b', code: 'B', name: 'Branch B' },
  ],
  previousCommittedImport: null,
  summary: { total: 1, ready: 1, conflicts: 0, invalid: 0 },
  planned: {
    created: 1,
    updated: 0,
    skipped: 0,
    moved: 0,
    openingDebts: 1,
    openingDebtTotalUsd: '10.00',
    balanceIncreases: 0,
    balanceIncreaseTotalUsd: '0.00',
    balancePayments: 0,
    balancePaymentTotalUsd: '0.00',
    dueDateRequired: true,
  },
  rows: [
    {
      rowNumber: 2,
      name: 'علي',
      phone: '03123456',
      phoneKey: '03123456',
      openingBalance: '10',
      currency: 'USD',
      branchId: 'a',
      branchName: 'فرع بيروت',
      chosenBranch: false,
      matchedBy: null,
      moveFrom: null,
      existingBranches: [],
      balance: { kind: 'NEW', current: '0.00', file: '10.00', difference: '10.00' },
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
      dueDate=""
      busy={false}
      error=""
      hasFile
      onBranch={vi.fn()}
      onFile={vi.fn()}
      onMapping={vi.fn()}
      onDecision={vi.fn()}
      onPassword={vi.fn()}
      onDueDate={vi.fn()}
      onRowBranches={vi.fn()}
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
    expect(session(false)).toContain('Default branch:');
  });

  it.each(customerImportSteps.map((label, index) => [label, index] as const))(
    'renders step %s with its destination banner',
    (_label, step) => {
      const html = render(step);
      expect(html).toContain('Default branch:');
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
    expect(render(5, { password: 'synthetic-password', dueDate: '2027-01-15' })).not.toMatch(
      /<button[^>]*disabled=""[^>]*>Commit import/
    );
    const noDebt = {
      ...preview,
      planned: {
        ...preview.planned,
        openingDebts: 0,
        openingDebtTotalUsd: '0.00',
        dueDateRequired: false,
      },
    };
    expect(render(5, { preview: noDebt })).not.toContain('type="password"');
    expect(render(5, { preview: noDebt })).not.toContain('Due date for new debts');
  });
  it('requires a due date before committing new debts, and a password for any money change', () => {
    expect(render(5)).toContain('Due date for new debts');
    expect(render(5, { password: 'synthetic-password' })).toMatch(
      /<button[^>]*disabled=""[^>]*>Commit import/
    );
    const paymentsOnly = {
      ...preview,
      planned: {
        ...preview.planned,
        openingDebts: 0,
        balancePayments: 1,
        dueDateRequired: false,
      },
    };
    const html = render(5, { preview: paymentsOnly });
    expect(html).toContain('type="password"');
    expect(html).not.toContain('Due date for new debts');
  });
  it('states each balance change plainly and lists changed rows first', () => {
    expect(
      balanceChangeText(
        { kind: 'DECREASE', current: '200.00', file: '100.00', difference: '-100.00' },
        'USD'
      )
    ).toBe('Owes $200.00 now, file says $100.00, change −$100.00');
    expect(
      balanceChangeText(
        { kind: 'INCREASE', current: '200.00', file: '260.00', difference: '60.00' },
        'USD'
      )
    ).toBe('Owes $200.00 now, file says $260.00, change +$60.00');
    expect(
      balanceChangeText({ kind: 'NONE', current: '1.00', file: '1.00', difference: '0.00' }, 'USD')
    ).toBeNull();
    const same = { kind: 'NONE', current: '1.00', file: '1.00', difference: '0.00' } as const;
    const lower = { kind: 'DECREASE', current: '2.00', file: '1.00', difference: '-1.00' } as const;
    expect(
      rowsChangedFirst([
        { rowNumber: 2, balance: same },
        { rowNumber: 3, balance: lower },
        { rowNumber: 4, balance: same },
      ]).map((row) => row.rowNumber)
    ).toEqual([3, 2, 4]);
  });
  it('offers a branch per row and for all rows, and shows the balance change in the table', () => {
    const row = {
      ...preview.rows[0],
      balance: {
        kind: 'DECREASE' as const,
        current: '200.00',
        file: '100.00',
        difference: '-100.00',
      },
      matches: [{ id: 'customer', name: 'علي' }],
      decision: { rowNumber: 2, action: 'UPDATE' as const, targetCustomerId: 'customer' },
    };
    const html = render(4, { preview: { ...preview, rows: [row] } });
    expect(html).toContain('Branch for row 2');
    expect(html).toContain('Set all rows to');
    expect(html).toContain('Branch B');
    expect(html).toContain('Owes $200.00 now');
    expect(html).toContain('Apply this change');
  });
  it('keeps the bulk branch choice visible and counts the rows in each branch', () => {
    const inB = { ...preview.rows[0], rowNumber: 3, branchId: 'b', branchName: 'Branch B' };
    const moved = { ...preview, rows: [{ ...inB, rowNumber: 2 }, inB] };
    expect(render(3, { preview: moved })).toMatch(
      /aria-label="Set all rows to branch"(?:(?!<\/select>)[\s\S])*<option[^>]*selected=""[^>]*>Branch B/
    );
    expect(render(3, { preview: moved })).toContain('2 rows');
    const mixed = render(3, { preview: { ...preview, rows: [preview.rows[0], inB] } });
    expect(mixed).toContain('Mixed branches');
    expect(mixed).toContain('Branch B</span>: 1 row');
    expect(render(3, { busy: true })).toContain('Updating branches');
  });
  it('asks before a branch choice moves existing customers, and only then', () => {
    const known = {
      ...preview.rows[0],
      name: 'Ali',
      existingBranches: [{ id: 'a', name: 'Main' }],
    };
    expect(branchMoveMessage([preview.rows[0]], 'b', 'Barja')).toBeNull();
    expect(branchMoveMessage([known], 'a', 'Main')).toBeNull();
    expect(branchMoveMessage([known], 'b', 'Barja')).toContain('Move "Ali" from Main to Barja?');
    expect(branchMoveMessage([known, { ...known, rowNumber: 3 }], 'b', 'Barja')).toContain(
      'Move 2 customers who are already in another branch to Barja?'
    );
  });
  it('offers to return chosen rows to their own branch, and allows adding a same-name customer as new', () => {
    const named = {
      ...preview.rows[0],
      chosenBranch: true,
      matchedBy: 'NAME' as const,
      matches: [{ id: 'customer', name: 'علي' }],
      decision: { rowNumber: 2, action: 'CREATE' as const },
    };
    const html = render(4, { preview: { ...preview, rows: [named] } });
    expect(html).toContain('Keep every customer in their own branch');
    expect(html).toContain('ADD AS NEW');
    expect(importNeedsResolution({ ...preview, rows: [named] })).toBe(false);
    expect(render(4)).not.toContain('Keep every customer in their own branch');
  });
  it('shows the branch as text when there is only one to choose', () => {
    const html = render(4, { preview: { ...preview, branches: [preview.branches[0]] } });
    expect(html).not.toContain('Branch for row 2');
    expect(html).not.toContain('Set all rows to');
  });
  it('prevents unresolved duplicates and undecided branches from proceeding', () => {
    expect(importNeedsResolution(preview)).toBe(false);
    expect(
      importNeedsResolution({
        ...preview,
        rows: [preview.rows[0], { ...preview.rows[0], rowNumber: 3 }],
      })
    ).toBe(true);
    expect(
      importNeedsResolution({
        ...preview,
        rows: [preview.rows[0], { ...preview.rows[0], rowNumber: 3, branchId: 'b' }],
      })
    ).toBe(false);
    const update = {
      ...preview.rows[0],
      matches: [{ id: 'customer', name: 'علي' }],
      decision: { rowNumber: 2, action: 'UPDATE' as const, targetCustomerId: 'customer' },
    };
    expect(importNeedsResolution({ ...preview, rows: [update] })).toBe(false);
    expect(
      importNeedsResolution({
        ...preview,
        rows: [
          {
            ...preview.rows[0],
            conflicts: [{ kind: 'BRANCH_AMBIGUOUS', message: 'Choose', blocking: true }],
          },
        ],
      })
    ).toBe(true);
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
    expect(html).toContain('download="customer-import-report.csv"');
    expect(html).toContain('data:text/csv');
    expect(html).toContain('$10.00');
    expect(
      renderToStaticMarkup(
        <CustomerImportSummary
          result={{
            created: 2,
            updated: 3,
            skipped: 4,
            moved: 0,
            openingDebts: 1,
            openingDebtTotalUsd: '19.55',
            balanceIncreases: 0,
            balanceIncreaseTotalUsd: '0.00',
            balancePayments: 0,
            balancePaymentTotalUsd: '0.00',
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
